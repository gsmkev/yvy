/** Inicio multi estancia. */
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
    <Button variant="primary">{t("ui.new.farm")}</Button>
  </Link>
);

/** Primeros pasos cuando todavía no hay estancias. */
function OnboardingEmpty({ canEdit }: { canEdit: boolean }) {
  return (
    <EmptyState title={t("ui.onboarding.title")} action={canEdit ? <NewFarmButton /> : undefined}>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>{t("ui.onboarding.1")}</li>
        <li>{t("ui.onboarding.2")}</li>
        <li>{t("ui.onboarding.3")}</li>
        <li>{t("ui.onboarding.4")}</li>
      </ol>
      <a href="/descargar-app" className="mt-3 inline-flex items-center gap-1.5 font-medium text-accion hover:underline">
        {t("ui.download.app")}
      </a>
    </EmptyState>
  );
}

/** Mapa con todas las estancias; un clic en una abre su pantalla. */
function HomeMap({ list, tilesBaseUrl }: { list: ReturnType<typeof useFarms>["data"] & {}; tilesBaseUrl: string | undefined }) {
  const navigate = useNavigate();
  return (
    <div className="relative h-72 lg:h-full">
      <FarmMap
        farms={list.map((f) => ({
          id: f.id,
          name: f.name,
          geometry: f.geometry,
          basemapPath: f.basemapPath,
          alert: f.activeAlerts > 0,
        }))}
        tilesBaseUrl={tilesBaseUrl}
        bounds={allFarmsBounds(list)}
        onMapClick={() => {}}
        onPointClick={(id) => navigate({ to: "/estancias/$farmId", params: { farmId: id } })}
      />
    </div>
  );
}

/** Guía de primeros pasos, o el botón para volver a mostrarla si se descartó con pasos pendientes. */
function GuideBlock({ g }: { g: ReturnType<typeof useHomeGuide> }) {
  const { steps, guide, dismissed, setGuide } = g;
  return (
    <>
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
          {t("ui.guide.show")}
        </button>
      )}
    </>
  );
}

/** Lista de estancias y, debajo, el resumen del dueño o los totales según el rol. */
function FarmsBlock({ list, summary }: { list: NonNullable<ReturnType<typeof useFarms>["data"]>; summary: boolean }) {
  if (list.length === 0) return null;
  return (
    <>
      <FarmList list={list} />
      {summary ? list.length > 1 && <OwnerDashboard /> : <FarmTotals list={list} />}
    </>
  );
}

/** Inicio multi estancia. */
export function HomePage() {
  const farms = useFarms();
  const me = useMe();
  const canEdit = !!me.data && !isFieldRole(me.data.role);
  const list = farms.data ?? [];
  const g = useHomeGuide(list, !!farms.data, me.data, canEdit);
  // El resumen del dueño ya trae superficie por cultivo, avisos y registros: no se repiten arriba
  const summary = me.data?.role === "owner" || me.data?.role === "admin";

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_440px]">
      <HomeMap list={list} tilesBaseUrl={me.data?.tilesBaseUrl} />
      <section className="flex flex-col gap-6 overflow-auto border-l border-linea p-4 sm:p-6 *:shrink-0">
        <PageHeader
          title={t("ui.common.homeTitle")}
          // sin estancias, el estado vacío ya lleva el mismo botón: una sola acción primaria
          primary={canEdit && !(farms.data && list.length === 0 && !g.guide) ? <NewFarmButton /> : undefined}
        />

        {farms.isLoading && <Spinner rows={3} h={72} />}
        {farms.error && <ErrorBox error={farms.error} />}
        <GuideBlock g={g} />
        {farms.data && list.length === 0 && !g.guide && <OnboardingEmpty canEdit={canEdit} />}

        <FarmsBlock list={list} summary={summary} />
      </section>
    </div>
  );
}
