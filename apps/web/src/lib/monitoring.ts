/**
 * Monitoreo de errores (P-02). Sin VITE_SENTRY_DSN no se carga ni se inicia nada: cero pedidos de red.
 * Con DSN, Sentry se baja aparte (import dinámico) para no pesar en el arranque. No se mandan datos personales.
 */
export function initMonitoring(dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN): void {
  if (!dsn?.trim()) return;
  void import("@sentry/react").then((Sentry) =>
    Sentry.init({
      dsn: dsn.trim(),
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      beforeSend(event) {
        delete event.user;
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      },
    }),
  );
}
