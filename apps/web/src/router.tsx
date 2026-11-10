import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getSession } from "./lib/api";
import { RootGate } from "./routes/public/RootGate";
import { Spinner } from "./components/ui";

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ingresar",
  component: lazyRouteComponent(() => import("./routes/login"), "LoginPage"),
  validateSearch: (s: Record<string, unknown>): { modo?: "registro" } =>
    s.modo === "registro" ? { modo: "registro" } : {},
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  // En "/" sin sesión RootGate muestra la landing pública; el resto de la app exige sesión.
  component: RootGate,
  beforeLoad: ({ location }) => {
    if (!getSession() && location.pathname !== "/") throw redirect({ to: "/ingresar" });
  },
});

const home = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/home"), "HomePage"),
});
const newFarm = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/nueva",
  component: lazyRouteComponent(() => import("./routes/farm-new"), "NewFarmPage"),
});
export const farmRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId",
  validateSearch: (s: Record<string, unknown>): { lote?: string } => ({
    lote: typeof s.lote === "string" ? s.lote : undefined,
  }),
  component: lazyRouteComponent(() => import("./routes/farm"), "FarmPage"),
});
export const reportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId/parte",
  component: lazyRouteComponent(() => import("./routes/report"), "ReportPage"),
  validateSearch: (s: Record<string, unknown>) => ({
    desde: s.desde as string | undefined,
    hasta: s.hasta as string | undefined,
  }),
});
const records = createRoute({
  getParentRoute: () => appRoute,
  path: "/registros",
  component: lazyRouteComponent(() => import("./routes/records"), "RecordsPage"),
});
const tasks = createRoute({
  getParentRoute: () => appRoute,
  path: "/tareas",
  component: lazyRouteComponent(() => import("./routes/tasks"), "TasksPage"),
});
const team = createRoute({
  getParentRoute: () => appRoute,
  path: "/equipo",
  component: lazyRouteComponent(() => import("./routes/team"), "TeamPage"),
});
const labs = createRoute({
  getParentRoute: () => appRoute,
  path: "/laboratorio",
  component: lazyRouteComponent(() => import("./routes/labs"), "LabsPage"),
});
const labsTool = createRoute({
  getParentRoute: () => appRoute,
  path: "/laboratorio/$tool",
  component: lazyRouteComponent(() => import("./routes/labs"), "LabsToolPage"),
});
const alerts = createRoute({
  getParentRoute: () => appRoute,
  path: "/avisos",
  component: lazyRouteComponent(() => import("./routes/alerts"), "AlertsPage"),
});
const internal = createRoute({
  getParentRoute: () => appRoute,
  path: "/interno",
  component: lazyRouteComponent(() => import("./routes/internal"), "InternalPage"),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([home, newFarm, farmRoute, reportRoute, records, tasks, team, labs, labsTool, alerts, internal]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingMs: 150,
  defaultPendingComponent: () => (
    <div className="p-6">
      <Spinner />
    </div>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
