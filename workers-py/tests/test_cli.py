from yvy_workers.__main__ import build_parser, ingest_days


def days(*argv: str) -> int:
    return ingest_days(build_parser().parse_args(["s2_ingest", *argv]))


def test_s2_ingest_diario_sigue_en_10_dias():
    assert days() == 10


def test_backfill_son_180_dias():
    assert days("--backfill") == 180


def test_days_explicito_manda_sobre_backfill():
    assert days("--backfill", "--days", "30") == 30
    assert days("--days", "45") == 45


class FakeApi:
    def __init__(self):
        self.status: list[tuple[str, str]] = []

    def imagery_status(self, farm_id: str, status: str) -> None:
        self.status.append((farm_id, status))


FARM = {"id": "f1", "name": "La Esperanza"}


def test_new_farm_corre_los_tres_pasos_en_orden():
    from yvy_workers.jobs.new_farm import new_farm

    order: list[str] = []

    def step(n):
        return lambda api, farm: order.append(n)

    api = FakeApi()
    assert new_farm(api, FARM, step("basemap"), step("clima"), step("s2")) == 0
    assert order == ["basemap", "clima", "s2"]
    assert api.status == [("f1", "processing")]


def test_new_farm_si_falla_el_mapa_base_marca_failed_y_sigue():
    from yvy_workers.jobs.new_farm import new_farm

    ran: list[str] = []

    def boom(api, farm):
        raise RuntimeError("sin escenas")

    api = FakeApi()
    n = new_farm(api, FARM, boom, lambda a, f: ran.append("clima"), lambda a, f: ran.append("s2"))
    assert n == 1 and ran == ["clima", "s2"]
    assert api.status == [("f1", "processing"), ("f1", "failed")]


def test_new_farm_exige_estancia(capsys):
    import pytest

    from yvy_workers.__main__ import main

    with pytest.raises(SystemExit):
        main(["new_farm"])
    assert "--farm" in capsys.readouterr().err


def test_argumentos_por_estancia():
    a = build_parser().parse_args(["s2_ingest", "--farm", "abc", "--backfill"])
    assert (a.job, a.farm, a.backfill) == ("s2_ingest", "abc", True)
