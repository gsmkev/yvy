/** ERP sencillo desde la web (ADR 0004). Montada en /org/erp. */
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { routes as catalogRoutes } from "./catalog";
import { routes as stockRoutes } from "./stock";
import { routes as operationsRoutes } from "./operations";
import { routes as financeRoutes } from "./finance";

export const erp = new Hono<AppEnv>();
erp.route("/", catalogRoutes);
erp.route("/", stockRoutes);
erp.route("/", operationsRoutes);
erp.route("/", financeRoutes);
