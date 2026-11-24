/** Consultas y edición para la web (y la ficha del lote en la app con red). */
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { routes as meRoutes } from "./me";
import { routes as overviewRoutes } from "./overview";
import { routes as farmsRoutes } from "./farms";
import { routes as fieldworkRoutes } from "./fieldwork";
import { routes as alertsRoutes } from "./alerts";

export const web = new Hono<AppEnv>();
web.route("/", meRoutes);
web.route("/", overviewRoutes);
web.route("/", farmsRoutes);
web.route("/", fieldworkRoutes);
web.route("/", alertsRoutes);
