/** Sesión en SecureStore: access JWT de 1 h + refresh de 90 días que se renueva al sincronizar. */
import Constants from "expo-constants";
import { secureDel, secureGet, secureSet } from "./secure";
import { useSyncExternalStore } from "react";

/** URL base del servidor, tomada de la configuración de la app. */
export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://10.0.2.2:8787";

/** Sesión guardada: tokens, usuario y organización. */
export interface Session {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; role: string };
  /** Todas las organizaciones del usuario (la API las manda siempre; sesiones viejas guardadas pueden no traerlas). */
  organizations?: { id: string; name: string; role: string }[];
}

const KEY = "yvy.session";
let session: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Lee la sesión guardada la primera vez y la devuelve; null si no hay. */
export async function loadSession(): Promise<Session | null> {
  if (!loaded) {
    const raw = await secureGet(KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
    loaded = true;
    emit();
  }
  return session;
}

/** Guarda la sesión, o la borra si es null, y avisa a las pantallas. */
export async function setSession(s: Session | null) {
  session = s;
  if (s) await secureSet(KEY, JSON.stringify(s));
  else await secureDel(KEY);
  emit();
}

/** Sesión actual en memoria, o null. */
export const getSession = () => session;
/** Sesión actual, reactiva. */
export const useSession = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
  );
/** Indica si ya se terminó de leer la sesión guardada. */
export const useSessionLoaded = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => loaded,
  );

/** El pedido falló por falta de señal. */
export class OfflineError extends Error {}
/** El servidor respondió con un estado de error; `status` es el código HTTP. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<string> | null = null;

/** Token vigente; renueva si falta poco. Sin red, devuelve el actual (el servidor dirá 401). */
export async function accessToken(): Promise<string> {
  const s = session;
  if (!s) throw new HttpError(401, "Sin sesión");
  if (s.accessTokenExpiresAt - Date.now() > 60_000) return s.accessToken;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
      if (res.status === 401) {
        await setSession(null);
        throw new HttpError(401, "Sesión vencida");
      }
      if (!res.ok) throw new HttpError(res.status, "No se pudo renovar la sesión");
      const next = (await res.json()) as Session;
      await setSession(next);
      return next.accessToken;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new OfflineError("Sin señal");
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * Pide a la API con el token de la sesión y lo renueva si hace falta.
 * @param auth Si es false no manda el token.
 * @throws OfflineError sin señal.
 * @throws HttpError si el servidor responde con error.
 */
export async function api<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${await accessToken()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new OfflineError("Sin señal");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(res.status, (data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}
