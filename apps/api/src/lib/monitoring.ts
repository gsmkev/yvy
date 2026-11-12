/**
 * Monitoreo de errores (P-02) con Sentry vía toucan-js. Sin SENTRY_DSN no se crea el cliente y no sale nada de
 * la red. Solo se informan errores inesperados (500, jobs y cola); los 4xx y las validaciones no.
 * Se sacan encabezados, cookies, cuerpo y query string: nunca viajan tokens ni datos del campo a Sentry.
 */
import { Toucan } from "toucan-js";
import type { Bindings } from "../types";

type Ctx = { waitUntil(p: Promise<unknown>): void } | undefined;

export const monitoringEnabled = (env: Pick<Bindings, "SENTRY_DSN">): boolean => !!env.SENTRY_DSN?.trim();

export function captureError(
  env: Pick<Bindings, "SENTRY_DSN" | "APP_ENV">,
  err: unknown,
  where: { request?: Request; ctx?: Ctx; tags?: Record<string, string> } = {},
): void {
  if (!monitoringEnabled(env)) return;
  try {
    const sentry = new Toucan({
      dsn: env.SENTRY_DSN!.trim(),
      environment: env.APP_ENV ?? "production",
      context: where.ctx,
      request: where.request,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.headers;
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.query_string;
        }
        delete event.user;
        return event;
      },
    });
    if (where.tags) sentry.setTags(where.tags);
    sentry.captureException(err);
  } catch {
    /* el monitoreo nunca rompe la respuesta */
  }
}
