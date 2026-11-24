/**
 * Ingreso sin contraseñas: código por email, QR, PIN, Google y segundo factor.
 * @module
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { routes as emailRoutes } from "./email";
import { routes as loginRoutes } from "./login";
import { routes as sessionRoutes } from "./session";
import { routes as googleRoutes } from "./google";
import { routes as totpRoutes } from "./totp";
/** Reexporte de `googleClaims` (lectura del id_token de Google), usado en pruebas. */
export { googleClaims } from "./google";

/** Rutas `/auth/*`: todas las rutas de ingreso y sesión montadas en un solo router. */
export const auth = new Hono<AppEnv>();
auth.route("/", emailRoutes);
auth.route("/", loginRoutes);
auth.route("/", sessionRoutes);
auth.route("/", googleRoutes);
auth.route("/", totpRoutes);
