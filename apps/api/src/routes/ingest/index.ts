/**
 * Entrada de los jobs Python que corren en GitHub Actions, firmada por HMAC.
 */
import { Hono } from "hono";
import type { IngestEnv } from "./shared";
import { verify } from "./shared";
import { routes as farmDataRoutes } from "./farm-data";
import { routes as alertsRoutes } from "./alerts";
import { routes as analysisRoutes } from "./analysis";

/** Router `/ingest`: verifica la firma y monta las rutas de datos, avisos y análisis. */
export const ingest = new Hono<IngestEnv>();
ingest.use("*", verify);
ingest.route("/", farmDataRoutes);
ingest.route("/", alertsRoutes);
ingest.route("/", analysisRoutes);
