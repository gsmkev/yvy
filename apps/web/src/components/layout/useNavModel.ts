import { isFieldRole } from "@yvy/shared";
import { useRouterState } from "@tanstack/react-router";
import { FEATURES } from "../../lib/features";
import { buildNav, isMapPath, isReportsPath } from "../../lib/nav";
import { loadPrefs } from "../../lib/prefs";
import { useAlerts, useFarms, useMe } from "../../lib/queries";
import { useOrganizations } from "../AccountMenu";
import type { NavContext } from "./NavLink";

/** Menú según el rol y las estancias, y el contexto con que se dibujan los ítems (ruta, estancias de destino, avisos). */
export function useNavModel() {
  const me = useMe();
  const alerts = useAlerts({ active: true });
  const farms = useFarms();
  // El agrónomo con más de un cliente tiene una pantalla con todos juntos
  const orgs = useOrganizations();
  const hasClients = orgs.filter((o) => !isFieldRole(o.role)).length > 1;
  const nav = buildNav({
    role: me.data?.role,
    farms: farms.data?.length ?? null,
    plots: farms.data ? farms.data.reduce((n, f) => n + f.plots, 0) : null,
    hasClients,
    isStaff: !!me.data?.isStaff,
    labs: FEATURES.labs,
  });
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Con varias estancias, "Mapa" vuelve a la última que se miró
  const lastFarm = (farms.data?.length ?? 0) > 1 ? farms.data!.find((f) => f.id === loadPrefs().farmId)?.id : undefined;
  const ctx: NavContext = {
    path,
    onMap: isMapPath(path),
    onReports: isReportsPath(path),
    lastFarm,
    // Informes vive dentro de la estancia: la última mirada o la primera
    reportsFarm: lastFarm ?? farms.data?.find((f) => f.id === loadPrefs().farmId)?.id ?? farms.data?.[0]?.id,
    nAlerts: alerts.data?.length ?? 0,
  };
  return { nav, ctx };
}
