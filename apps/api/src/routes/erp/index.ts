/**
 * ERP sencillo desde la web. Montado en /org/erp.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { routes as catalogRoutes } from "./catalog";
import { routes as stockRoutes } from "./stock";
import { routes as operationsRoutes } from "./operations";
import { routes as financeRoutes } from "./finance";

/** Router del ERP: reúne las rutas de catálogo, stock, operaciones y finanzas. */
export const erp = new Hono<AppEnv>();
erp.route("/", catalogRoutes);
erp.route("/", stockRoutes);
erp.route("/", operationsRoutes);
erp.route("/", financeRoutes);
