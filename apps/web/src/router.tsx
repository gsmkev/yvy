import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { getSession } from "./lib/api";
import { Layout } from "./components/Layout";
import { LoginPage } from "./routes/login";
import { HomePage } from "./routes/home";
import { NewFarmPage } from "./routes/farm-new";
import { FarmPage } from "./routes/farm";
import { ReportPage } from "./routes/report";
import { RecordsPage } from "./routes/records";
import { TasksPage } from "./routes/tasks";
import { TeamPage } from "./routes/team";
import { AlertsPage } from "./routes/alerts";

const rootRoute = createRootRoute();

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/ingresar", component: LoginPage });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: Layout,
  beforeLoad: () => {
    if (!getSession()) throw redirect({ to: "/ingresar" });
  },
});

const home = createRoute({ getParentRoute: () => appRoute, path: "/", component: HomePage });
const newFarm = createRoute({ getParentRoute: () => appRoute, path: "/estancias/nueva", component: NewFarmPage });
export const farmRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId",
  component: FarmPage,
});
export const reportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/estancias/$farmId/parte",
  component: ReportPage,
  validateSearch: (s: Record<string, unknown>) => ({
    desde: s.desde as string | undefined,
    hasta: s.hasta as string | undefined,
  }),
});
const records = createRoute({ getParentRoute: () => appRoute, path: "/registros", component: RecordsPage });
const tasks = createRoute({ getParentRoute: () => appRoute, path: "/tareas", component: TasksPage });
const team = createRoute({ getParentRoute: () => appRoute, path: "/equipo", component: TeamPage });
const alerts = createRoute({ getParentRoute: () => appRoute, path: "/avisos", component: AlertsPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([home, newFarm, farmRoute, reportRoute, records, tasks, team, alerts]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
