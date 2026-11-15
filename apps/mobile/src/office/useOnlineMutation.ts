/** Escritura en línea (sin outbox): no corre sin señal ni en la demo (el modo solo lectura del dueño no la frena: solo bloquea anotaciones de campo), muestra el error del servidor e invalida lecturas al terminar bien. */
import { useCallback, useRef, useState } from "react";
import { t } from "@yvy/shared";
import { useIsDemo } from "../lib/demo";
import { success } from "../lib/haptics";
import { api, OfflineError } from "../lib/session";
import { useSyncStatus } from "../lib/sync";
import { invalidate } from "./cache";

export type MutationResult<TRes> = { ok: true; data: TRes } | { ok: false; error: string };

export interface OnlineMutation<TBody, TRes> {
  /** Nunca lanza: devuelve `{ ok, data }` o `{ ok: false, error }` (el mismo texto queda en `error`). */
  mutate: (body: TBody) => Promise<MutationResult<TRes>>;
  pending: boolean;
  error: string | null;
  /** Limpia `error` (p. ej. al cerrar el formulario). */
  reset: () => void;
}

export function useOnlineMutation<TBody = void, TRes = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string | ((body: TBody) => string),
  opts: { invalidate?: string[] } = {},
): OnlineMutation<TBody, TRes> {
  const online = useSyncStatus().online;
  const demo = useIsDemo();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef({ online, path, opts, block: null as string | null });
  live.current = { online, path, opts, block: demo ? t("ui.publicDemoReadOnly") : null };
  const busy = useRef(false);

  const fail = (msg: string): MutationResult<TRes> => (setError(msg), { ok: false, error: msg });

  const mutate = useCallback(async (body: TBody): Promise<MutationResult<TRes>> => {
    if (busy.current) return { ok: false, error: "" }; // doble toque: se ignora, el primero sigue en curso
    const { online: on, path: p, opts: o, block } = live.current;
    if (block) return fail(block);
    if (!on) return fail(t("office.needsSignal"));
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const data = await api<TRes>(method, typeof p === "function" ? p(body) : p, body === undefined ? undefined : body);
      if (o.invalidate?.length) invalidate(o.invalidate);
      success();
      return { ok: true, data };
    } catch (e) {
      return fail(e instanceof OfflineError ? t("office.needsSignal") : e instanceof Error ? e.message : t("office.loadFailed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [method]);

  return { mutate, pending, error, reset: useCallback(() => setError(null), []) };
}
