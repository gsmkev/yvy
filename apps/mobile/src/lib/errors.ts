/** Errores del cliente de la API. Viven aparte de session.ts para poder probarlos sin Expo. */
export class OfflineError extends Error {}
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
