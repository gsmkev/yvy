/**
 * Escrituras en línea (ola 0): crear una tarea, dar de alta a una persona, marcar un registro como revisado. No pasan
 * por el outbox: esas tablas no son sincronizables y sus reglas de conflicto no están definidas (el servidor manda).
 * Si no hay señal no se intenta: el botón dice "Necesita conexión" y no se pierde lo que la persona escribió.
 */
import { t } from "@yvy/shared";
import { HttpError, OfflineError } from "./errors";

/** Texto para la persona de un error al escribir: sin señal, sin permiso, ya no existe, o el motivo que dio el servidor. */
export function writeErrorText(e: unknown): string {
  if (e instanceof OfflineError || e instanceof TypeError) return t("app.needsConnection");
  if (e instanceof HttpError) {
    if (e.status === 401) return t("app.onlineSessionExpired");
    if (e.status === 403) return /segundo factor/i.test(e.message) ? e.message : t("app.onlineForbidden");
    if (e.status === 404) return t("app.onlineNotFound");
    if (e.status === 429) return t("app.onlineTooMany");
    // Los 400 y 409 traen el motivo en es-PY (por ejemplo "Otra persona ya ingresa con ese teléfono").
    if (e.status >= 400 && e.status < 500 && e.message && !/^HTTP \d+$/.test(e.message)) return e.message;
  }
  return t("app.onlineGenericError");
}

export type WriteState = { phase: "idle" } | { phase: "sending" } | { phase: "done" } | { phase: "error"; message: string };

/**
 * Corre una escritura con su estado. `online` viene del estado de red de la app; aun con `online` verdadero la llamada
 * puede fallar por falta de señal y se informa igual.
 */
export async function runWrite<R>(
  online: boolean,
  fn: () => Promise<R>,
  set: (s: WriteState) => void,
): Promise<{ ok: true; value: R } | { ok: false }> {
  if (!online) {
    set({ phase: "error", message: t("app.needsConnection") });
    return { ok: false };
  }
  set({ phase: "sending" });
  try {
    const value = await fn();
    set({ phase: "done" });
    return { ok: true, value };
  } catch (e) {
    set({ phase: "error", message: writeErrorText(e) });
    return { ok: false };
  }
}
