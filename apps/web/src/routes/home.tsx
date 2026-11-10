import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { FarmMap } from "../components/FarmMap";
import { Button, Empty, ErrorBox, SectionHead, Spinner, Stat } from "../components/ui";
import { fmtDate, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";

/** Inicio multi estancia (RF-90). */
export function HomePage() {
  const farms = useFarms();
  const me = useMe();
  const navigate = useNavigate();
  const canEdit = me.data && me.data.role !== "worker";
  const list = farms.data ?? [];
  // Con una sola estancia, el mapa de esa estancia es el inicio
  const only = list.length === 1 ? list[0]!.id : null;
  useEffect(() => {
    if (only) navigate({ to: "/estancias/$farmId", params: { farmId: only }, replace: true });
  }, [only]);
  const pad = 0.01;
  const bounds: [number, number, number, number] | null = list.length
    ? [
        Math.min(...list.map((f) => f.minLon)) - pad,
        Math.min(...list.map((f) => f.minLat)) - pad,
        Math.max(...list.map((f) => f.maxLon)) + pad,
        Math.max(...list.map((f) => f.maxLat)) + pad,
      ]
    : null;
  const totalHa = list.reduce((a, f) => a + f.areaHa, 0);
  const alerts = list.reduce((a, f) => a + f.activeAlerts, 0);
  const records = list.reduce((a, f) => a + f.records7d, 0);

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="relative h-72 lg:h-full">
        <FarmMap
          farms={list.map((f) => ({
            id: f.id,
            name: f.name,
            geometry: f.geometry,
            basemapPath: f.basemapPath,
            alert: f.activeAlerts > 0,
          }))}
          tilesBaseUrl={me.data?.tilesBaseUrl}
          bounds={bounds}
          onMapClick={() => {}}
          onPointClick={(id) => navigate({ to: "/estancias/$farmId", params: { farmId: id } })}
        />
      </div>
      <section className="flex flex-col gap-6 overflow-auto border-l border-linea p-6 *:shrink-0">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight">{t("ui.homeTitle")}</h1>
          </div>
          {canEdit && (
            <Link to="/estancias/nueva">
              <Button variant="primary" icon={Plus}>
                {t("ui.newFarm")}
              </Button>
            </Link>
          )}
        </header>

        {list.length > 0 && (
          <div className="grid grid-cols-3 gap-4 border-y border-linea py-4">
            <Stat label={t("ui.area")} value={fmtNum(totalHa)} unit="ha" />
            <Stat label={t("ui.records7d")} value={records} />
            <Stat label={t("ui.activeAlerts")} value={alerts} tone={alerts ? "danger" : undefined} />
          </div>
        )}

        {farms.isLoading && <Spinner />}
        {farms.error && <ErrorBox error={farms.error} />}
        {farms.data && list.length === 0 && (
          <Empty title={t("ui.onboardingTitle")}>
            <ol className="mt-1 flex list-decimal flex-col gap-1.5 pl-5">
              <li>{t("ui.onboarding1")}</li>
              <li>{t("ui.onboarding2")}</li>
              <li>{t("ui.onboarding3")}</li>
              <li>{t("ui.onboarding4")}</li>
            </ol>
            <a
              href="/descargar-app"
              className="mt-3 inline-flex items-center gap-1.5 font-medium text-accion hover:underline"
            >
              {t("ui.downloadApp")}
            </a>
          </Empty>
        )}

        {list.length > 0 && (
          <div>
            <SectionHead title={t("ui.farmsTitle")} count={list.length} />
            <ul className="divide-y divide-linea">
              {list.map((f) => (
                <li key={f.id}>
                  <Link
                    to="/estancias/$farmId"
                    params={{ farmId: f.id }}
                    className="group flex items-center gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h2 className="truncate font-semibold group-hover:underline">{f.name}</h2>
                        {f.department && <span className="text-sm text-tinta-2">{f.department}</span>}
                      </div>
                      <p className="num mt-1 text-xs text-tinta-2">
                        {fmtNum(f.areaHa)} ha · {f.plots} {t("ui.plots").toLowerCase()} · {f.workers}{" "}
                        {t("ui.workers").toLowerCase()} ·{" "}
                        {f.lastRecordAt
                          ? `${t("ui.lastRecord").toLowerCase()} ${fmtDate(f.lastRecordAt)}`
                          : t("ui.neverRecorded").toLowerCase()}
                      </p>
                      {f.activeAlerts > 0 && (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-peligro">
                          <AlertTriangle size={13} aria-hidden />{" "}
                          {t(f.activeAlerts === 1 ? "ui.alertsCountOne" : "ui.alertsCountMany", { n: f.activeAlerts })}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      size={18}
                      className="text-tinta-2 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
