import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { parseReferralCode } from "@yvy/shared";
import { getSession } from "./lib/api";
import { RootGate } from "./routes/public/RootGate";
import { Spinner } from "./components/ui";

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ingresar",
  component: lazyRouteComponent(() => import("./routes/login"), "LoginPage"),
  // `ref`: código de referido de un agrónomo (V-05); abre el registro y viaja con el alta
  validateSearch: (s: Record<string, unknown>): { modo?: "registro"; ref?: string } => {
    const ref = parseReferralCode(s.ref) ?? undefined;
    return { ...(s.modo === "registro" || ref ? { modo: "registro" as const } : {}), ...(ref ? { ref } : {}) };
  },
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminos",
  component: lazyRouteComponent(() => import("./routes/public/legal"), "TermsPage"),
});
const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacidad",
  component: lazyRouteComponent(() => import("./routes/public/legal"), "PrivacyPage"),
});

const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/compartido/$token",
  component: lazyRouteComponent(() => import("./routes/reports-shared"), "SharedPage"),
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
const farmReports = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId/informes",
  component: lazyRouteComponent(() => import("./routes/reports-farm"), "FarmReportsPage"),
});
const farmGauges = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId/pluviometros",
  component: lazyRouteComponent(() => import("./routes/rain-gauges"), "RainGaugesPage"),
});
const farmRisk = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId/riesgo",
  component: lazyRouteComponent(() => import("./routes/risk"), "RiskPage"),
});
const farmEudr = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId/eudr",
  component: lazyRouteComponent(() => import("./routes/eudr"), "EudrPage"),
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
const sanitary = createRoute({
  getParentRoute: () => appRoute,
  path: "/sanidad",
  component: lazyRouteComponent(() => import("./routes/sanitary"), "SanitaryPage"),
});
const team = createRoute({
  getParentRoute: () => appRoute,
  path: "/equipo",
  component: lazyRouteComponent(() => import("./routes/team"), "TeamPage"),
});
const help = createRoute({
  getParentRoute: () => appRoute,
  path: "/ayuda",
  component: lazyRouteComponent(() => import("./routes/help"), "HelpPage"),
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
const account = createRoute({
  getParentRoute: () => appRoute,
  path: "/cuenta",
  component: lazyRouteComponent(() => import("./routes/public/account"), "AccountPage"),
});
const clients = createRoute({
  getParentRoute: () => appRoute,
  path: "/clientes",
  component: lazyRouteComponent(() => import("./routes/clients"), "ClientsPage"),
});
const internal = createRoute({
  getParentRoute: () => appRoute,
  path: "/interno",
  component: lazyRouteComponent(() => import("./routes/internal"), "InternalPage"),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  termsRoute,
  privacyRoute,
  sharedRoute,
  appRoute.addChildren([
    home,
    newFarm,
    farmRoute,
    reportRoute,
    farmReports,
    farmGauges,
    farmRisk,
    farmEudr,
    records,
    tasks,
    sanitary,
    team,
    help,
    labs,
    labsTool,
    alerts,
    account,
    clients,
    internal,
  ]),
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
