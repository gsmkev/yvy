/**
 * Qué se guarda para usar sin conexión y qué no (ADR 0005). Puro: lo usan el service worker y la página.
 * `WORKER_FIRST` es el mismo conjunto que `run_worker_first` de apps/api/wrangler.jsonc (lo verifica un test).
 */

/** Rutas que sirve el Worker antes que los assets estáticos: nunca son navegaciones de la app. */
export const WORKER_FIRST = [
  "/auth/",
  "/sync/",
  "/org/",
  "/media/",
  "/ingest/",
  "/public/",
  "/v1/",
  "/admin/",
  "/me",
  "/events",
  "/devices",
  "/health",
  "/descargar-app",
] as const;

export const isWorkerFirst = (path: string): boolean =>
  WORKER_FIRST.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(p + "/")));

/**
 * Lecturas con copia de respaldo: GET /org/* y unas pocas de /me. Quedan afuera todo lo que tiene secretos, montos
 * o es de administración: el ERP, los tokens de API, los webhooks, la seguridad de la cuenta, los enlaces para
 * compartir, los informes programados (destinatarios externos), el plan y los permisos.
 */
const DENIED_ORG =
  /^\/org\/(erp|api-tokens|webhooks|security|share-links|report-schedules|plan|plan-request|delete-request|farm-access|calendar-feed|prescriptions)(\/|$)|^\/org\/members\/[^/]+\/pin(\/|$)|^\/org\/farms\/[^/]+\/(share-links|calendar-feed)(\/|$)/;
const ALLOWED_ME = /^\/me(\/onboarding)?$/;

export const isCacheableData = (path: string): boolean => {
  if (path.startsWith("/org/")) return !DENIED_ORG.test(path);
  return ALLOWED_ME.test(path);
};

/** Claves de consultas de TanStack Query que no se guardan en el dispositivo (mismo criterio que arriba). */
const NO_PERSIST_KEYS = new Set([
  "erp",
  "admin-metrics",
  "admin-trial-requests",
  "admin-plan-requests",
  "admin-funnel",
  "admin-audit",
  "admin-audit-org",
  "api-tokens",
  "webhooks",
  "totp",
  "org-security",
  "plan",
  "share-links",
  "report-schedules",
  "farm-access",
  "referral",
  "calendar-feed",
  "clients",
  "lead-report",
  "shared",
  "public-status",
  "google-enabled",
  "notification-prefs",
]);

export const isPersistableQueryKey = (key: readonly unknown[]): boolean =>
  typeof key[0] === "string" && !NO_PERSIST_KEYS.has(key[0]);

/** Hosts de fuentes web que se sirven de la copia si no hay red. */
export const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"] as const;
