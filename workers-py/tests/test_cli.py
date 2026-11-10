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


def test_argumentos_por_estancia():
    a = build_parser().parse_args(["s2_ingest", "--farm", "abc", "--backfill"])
    assert (a.job, a.farm, a.backfill) == ("s2_ingest", "abc", True)
