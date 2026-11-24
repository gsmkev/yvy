/** Ingreso sin contraseñas (PRD-cloudflare §4.2): código por email, QR, PIN, Google y segundo factor. */
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { routes as emailRoutes } from "./email";
import { routes as loginRoutes } from "./login";
import { routes as sessionRoutes } from "./session";
import { routes as googleRoutes } from "./google";
import { routes as totpRoutes } from "./totp";
export { googleClaims } from "./google";

export const auth = new Hono<AppEnv>();
auth.route("/", emailRoutes);
auth.route("/", loginRoutes);
auth.route("/", sessionRoutes);
auth.route("/", googleRoutes);
auth.route("/", totpRoutes);
