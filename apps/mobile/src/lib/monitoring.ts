/**
 * Monitoreo de errores (P-02). Sin EXPO_PUBLIC_SENTRY_DSN no se carga el SDK ni se manda nada.
 * Se inicia en el arranque; los errores de JS y los cierres nativos llegan a Sentry sin datos personales.
 */
export function initMonitoring(dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN): void {
  if (!dsn?.trim()) return;
  void import("@sentry/react-native").then((Sentry) =>
    Sentry.init({
      dsn: dsn.trim(),
      sendDefaultPii: false,
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
