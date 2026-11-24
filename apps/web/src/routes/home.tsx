import { isFieldRole } from "@yvy/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { FarmMap } from "../components/FarmMap";
import { FirstRunGuide } from "../components/FirstRunGuide";
import { OwnerDashboard } from "../components/OwnerDashboard";
import { Button, EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { t } from "../lib/i18n";
import { savePrefs } from "../lib/prefs";
import { useFarms, useMe } from "../lib/queries";
import { allFarmsBounds, FarmList, FarmTotals } from "./home/FarmList";
import { useHomeGuide } from "./home/useHomeGuide";

const NewFarmButton = () => (
  <Link to="/estancias/nueva">
    <Button variant="primary">{t("ui.newFarm")}</Button>
  </Link>
);

/** Primeros pasos cuando todavía no hay estancias. */
function OnboardingEmpty({ canEdit }: { canEdit: boolean }) {
  return (
    <EmptyState title={t("ui.onboardingTitle")} action={canEdit ? <NewFarmButton /> : undefined}>
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
  );
}

/** Inicio multi estancia (RF-90). */
export function HomePage() {
  const farms = useFarms();
  const me = useMe();
  const navigate = useNavigate();
  const canEdit = !!me.data && !isFieldRole(me.data.role);
  const list = farms.data ?? [];
  const { steps, guide, dismissed, setGuide } = useHomeGuide(list, !!farms.data, me.data, canEdit);
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
          bounds={allFarmsBounds(list)}
          onMapClick={() => {}}
          onPointClick={(id) => navigate({ to: "/estancias/$farmId", params: { farmId: id } })}
        />
      </div>
      <section className="flex flex-col gap-6 overflow-auto border-l border-linea p-4 sm:p-6 *:shrink-0">
        <PageHeader
          title={t("ui.homeTitle")}
          // sin estancias, el estado vacío ya lleva el mismo botón: una sola acción primaria
          primary={canEdit && !(farms.data && list.length === 0 && !guide) ? <NewFarmButton /> : undefined}
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
        {farms.data && list.length === 0 && !guide && <OnboardingEmpty canEdit={canEdit} />}

        {list.length > 0 && <FarmList list={list} />}

        {list.length > 1 && summary && <OwnerDashboard />}
        {list.length > 0 && !summary && <FarmTotals list={list} />}
      </section>
    </div>
  );
}
