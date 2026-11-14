import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { FarmMap } from "../components/FarmMap";
import { FirstRunGuide, guideSteps } from "../components/FirstRunGuide";
import { OwnerDashboard } from "../components/OwnerDashboard";
import { Button, EmptyState, ErrorBox, PageHeader, Spinner, Stat } from "../components/ui";
import { areaUnitLabel, fmtAreaValue, fmtDate, fmtHa } from "../lib/format";
import { t } from "../lib/i18n";
import { loadPrefs, savePrefs } from "../lib/prefs";
import { put } from "../lib/api";
import { useFarms, useMe, useMembers, useOnboarding } from "../lib/queries";

/** Inicio multi estancia (RF-90). */
export function HomePage() {
  const farms = useFarms();
  const me = useMe();
  const navigate = useNavigate();
  const canEdit = me.data && !isFieldRole(me.data.role);
  const list = farms.data ?? [];
  const members = useMembers(!!canEdit);
  const qc = useQueryClient();
  const onboarding = useOnboarding(!!canEdit);
  const setGuide = useMutation({
    mutationFn: (dismissed: boolean) => put<{ dismissedAt: number | null }>("/me/onboarding", { dismissed }),
    onMutate: (d) => qc.setQueryData(["onboarding"], { dismissedAt: d ? Date.now() : null }),
    onSuccess: (r) => qc.setQueryData(["onboarding"], r),
  });
  // Lo que ocultó antes en este navegador vale hasta que el servidor responda
  const dismissed = onboarding.data ? onboarding.data.dismissedAt !== null : !!loadPrefs().guideDismissed;
  // Guía de primera vez: solo para quien edita, hasta completar los 4 pasos o descartarla
  const steps = canEdit && farms.data && members.data ? guideSteps(list, members.data) : null;
  const guide = steps && !dismissed && steps.some((s) => !s.done) ? steps : null;
  const ready = !!me.data && (!canEdit || ((!!members.data || members.isError) && (!onboarding.isLoading)));
  // Con una sola estancia, el mapa de esa estancia es el inicio (salvo que falte completar la guía)
  const only = list.length === 1 && ready && !guide ? list[0]!.id : null;
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
  // El resumen del dueño ya trae superficie por cultivo, avisos y registros: no se repiten arriba
  const summary = me.data?.role === "owner" || me.data?.role === "admin";

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
      <section className="flex flex-col gap-6 overflow-auto border-l border-linea p-4 sm:p-6 *:shrink-0">
        <PageHeader
          title={t("ui.homeTitle")}
          primary={
            canEdit ? (
              <Link to="/estancias/nueva">
                <Button variant="primary">{t("ui.newFarm")}</Button>
              </Link>
            ) : undefined
          }
        />

        {farms.isLoading && <Spinner rows={3} h={72} />}
        {farms.error && <ErrorBox error={farms.error} />}
        {guide && (
          <FirstRunGuide
            steps={guide}
            onDismiss={() => {
              savePrefs({ guideDismissed: true });
              setGuide.mutate(true);
            }}
          />
        )}
        {steps && dismissed && steps.some((s) => !s.done) && (
          <button
            className="flex h-10 cursor-pointer items-center self-start text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
            onClick={() => setGuide.mutate(false)}
          >
            {t("ui.guideShow")}
          </button>
        )}
        {farms.data && list.length === 0 && !guide && (
          <EmptyState
            title={t("ui.onboardingTitle")}
            action={
              canEdit ? (
                <Link to="/estancias/nueva">
                  <Button variant="primary">{t("ui.newFarm")}</Button>
                </Link>
              ) : undefined
            }
          >
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              <li>{t("ui.onboarding1")}</li>
              <li>{t("ui.onboarding2")}</li>
              <li>{t("ui.onboarding3")}</li>
              <li>{t("ui.onboarding4")}</li>
            </ol>
            <a href="/descargar-app" className="mt-3 inline-flex items-center gap-1.5 font-medium text-accion hover:underline">
              {t("ui.downloadApp")}
            </a>
          </EmptyState>
        )}

        {list.length > 0 && (
          <ul className="-mt-2 divide-y divide-linea border-y border-linea">
            {list.map((f) => (
              <li key={f.id}>
                <Link to="/estancias/$farmId" params={{ farmId: f.id }} className="group flex min-h-14 items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] leading-5 font-semibold group-hover:underline">{f.name}</h2>
                    <p className="num text-xs leading-4 text-tinta-2">
                      {[
                        f.department,
                        fmtHa(f.areaHa),
                        `${f.plots} ${t("ui.plots").toLowerCase()}`,
                        f.lastRecordAt
                          ? `${t("ui.lastRecord").toLowerCase()} ${fmtDate(f.lastRecordAt)}`
                          : t("ui.neverRecorded").toLowerCase(),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {f.activeAlerts > 0 && (
                    <span className="shrink-0 text-xs font-medium text-peligro">
                      {t(f.activeAlerts === 1 ? "ui.alertsCountOne" : "ui.alertsCountMany", { n: f.activeAlerts })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {list.length > 1 && summary && <OwnerDashboard />}
        {list.length > 0 && !summary && (
          <div className="grid grid-cols-3 gap-4">
            <Stat label={t("ui.area")} value={fmtAreaValue(totalHa)} unit={areaUnitLabel()} />
            <Stat label={t("ui.records7d")} value={records} />
            <Stat label={t("ui.activeAlerts")} value={alerts} tone={alerts ? "danger" : undefined} />
          </div>
        )}
      </section>
    </div>
  );
}
