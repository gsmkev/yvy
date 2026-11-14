/** Sesión en SecureStore: access JWT de 1 h + refresh de 90 días que se renueva al sincronizar. */
import Constants from "expo-constants";
import { secureDel, secureGet, secureSet } from "./secure";
import { useSyncExternalStore } from "react";
import { HttpError, OfflineError } from "./errors";

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://10.0.2.2:8787";

export interface Session {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; role: string };
  /** Todas las organizaciones de la persona (selector de organización). Una sesión vieja no lo trae hasta renovarse. */
  organizations?: { id: string; name: string; role: string }[];
  /** P-08: la organización exige segundo factor a los administradores y este todavía no lo activó; la API rechaza todo salvo /auth/totp. */
  mfaSetupRequired?: boolean;
}

const KEY = "yvy.session";
let session: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadSession(): Promise<Session | null> {
  if (!loaded) {
    const raw = await secureGet(KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
    loaded = true;
    emit();
  }
  return session;
}

export async function setSession(s: Session | null) {
  session = s;
  if (s) await secureSet(KEY, JSON.stringify(s));
  else await secureDel(KEY);
  emit();
}

export const getSession = () => session;
export const useSession = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
  );
export const useSessionLoaded = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => loaded,
  );

export { HttpError, OfflineError };

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
