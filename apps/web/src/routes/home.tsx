import { Link, useNavigate } from "@tanstack/react-router";
import { BRAND } from "@yvy/shared";
import { FarmMap } from "../components/FarmMap";
import { Button, Card, ErrorBox, Spinner } from "../components/ui";
import { fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";

export function HomePage() {
  const farms = useFarms();
  const me = useMe();
  const navigate = useNavigate();
  const canEdit = me.data && me.data.role !== "worker";
  const list = farms.data ?? [];
  const bounds: [number, number, number, number] | null = list.length
    ? [
        Math.min(...list.map((f) => f.minLon)),
        Math.min(...list.map((f) => f.minLat)),
        Math.max(...list.map((f) => f.maxLon)),
        Math.max(...list.map((f) => f.maxLat)),
      ]
    : null;

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="h-72 lg:h-full">
        <FarmMap
          points={list.map((f) => ({
            id: f.id,
            lon: f.centroidLon,
            lat: f.centroidLat,
            color: f.activeAlerts ? BRAND.alerta : BRAND.trigo,
          }))}
          bounds={bounds}
          onPointClick={(id) => navigate({ to: "/estancias/$farmId", params: { farmId: id } })}
        />
      </div>
      <section className="flex flex-col gap-3 overflow-auto p-4 *:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("ui.homeTitle")}</h1>
          {canEdit && (
            <Link to="/estancias/nueva">
              <Button>+ {t("ui.newFarm")}</Button>
            </Link>
          )}
        </div>
        {farms.isLoading && <Spinner />}
        {farms.error && <ErrorBox error={farms.error} />}
        {farms.data && list.length === 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">{t("ui.onboardingTitle")}</h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
              <li>{t("ui.onboarding1")}</li>
              <li>{t("ui.onboarding2")}</li>
              <li>{t("ui.onboarding3")}</li>
              <li>{t("ui.onboarding4")}</li>
            </ol>
            <a href="/descargar-app" className="mt-3 inline-block text-sm font-medium text-soja-dark underline">
              ⤓ {t("ui.downloadApp")}
            </a>
          </Card>
        )}
        {list.map((f) => (
          <Link key={f.id} to="/estancias/$farmId" params={{ farmId: f.id }}>
            <Card className="transition hover:ring-soja/40">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{f.name}</h2>
                <span className="text-sm text-surco/60">{fmtHa(f.areaHa)}</span>
              </div>
              <p className="mt-1 text-sm text-surco/70">
                {f.plots} {t("ui.plots").toLowerCase()} · {f.workers} {t("ui.workers").toLowerCase()} ·{" "}
                {f.lastRecordAt ? `${t("ui.lastRecord")}: ${fmtDate(f.lastRecordAt)}` : t("ui.neverRecorded")}
              </p>
              {f.activeAlerts > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-alerta px-2 py-0.5 text-xs font-semibold text-white">
                  ▲ {f.activeAlerts} {t("ui.activeAlerts").toLowerCase()}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
