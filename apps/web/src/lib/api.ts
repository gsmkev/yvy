/** Cliente de la API del Worker con renovación automática de sesión. */
import { t } from "./i18n";

/** Sesión guardada: tokens, vencimiento del de acceso, usuario, organización activa y las demás organizaciones. */
export interface Session {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  user: { id: string; fullName: string; email: string | null };
  organization: { id: string; name: string; role: string };
  organizations: { id: string; name: string; role: string }[];
  /** Sesión de soporte (solo lectura, sin renovación). */
  support?: boolean;
  /** La organización exige segundo factor a los administradores y este todavía no lo activó. */
  mfaSetupRequired?: boolean;
}

const KEY = "yvy.session";
let session: Session | null = load();
const listeners = new Set<(s: Session | null) => void>();

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/** Sesión actual en memoria, o null. */
export const getSession = () => session;

// ---- "ver como soporte" ----
const STAFF_KEY = "yvy.staff-session";

/** Pasa a la sesión de soporte; la del equipo queda guardada en esta pestaña para volver. */
export function enterSupport(s: Session) {
  try {
    sessionStorage.setItem(STAFF_KEY, JSON.stringify(session));
  } catch {
    /* sin sessionStorage: al salir habrá que ingresar de nuevo */
  }
  setSession({ ...s, support: true });
  window.location.assign("/");
}

/** Vuelve a la sesión del equipo (o cierra si no se puede) y recarga: nada de lo cacheado era de esta organización. */
export function exitSupport() {
  let back: Session | null = null;
  try {
    back = JSON.parse(sessionStorage.getItem(STAFF_KEY) ?? "null") as Session | null;
    sessionStorage.removeItem(STAFF_KEY);
  } catch {
    /* ignorar */
  }
  setSession(back);
  window.location.assign(back ? "/interno" : "/ingresar");
}

/** Reemplaza la sesión, la guarda y avisa a los suscriptores. */
export function setSession(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado */
  }
  listeners.forEach((l) => l(s));
}

/**
 * Suscripción a los cambios de sesión.
 * @returns la función que cancela.
 */
export const onSession = (fn: (s: Session | null) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Error de una respuesta HTTP no exitosa, con el estado y el código que manda el Worker. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Falla de red (sin respuesta del servidor): distinta de un error HTTP. */
export class NetworkError extends Error {
  constructor() {
    super(t("ui.common.networkError"));
  }
}

let networkDown = false;
const netListeners = new Set<() => void>();
const setNetworkDown = (v: boolean) => {
  if (v === networkDown) return;
  networkDown = v;
  netListeners.forEach((l) => l());
};
/** Si el último intento de llegar al servidor falló por red. */
export const isNetworkDown = () => networkDown;
/**
 * Suscripción a los cambios de conectividad.
 * @returns la función que cancela.
 */
export const onNetworkChange = (fn: () => void) => {
  netListeners.add(fn);
  return () => {
    netListeners.delete(fn);
  };
};
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => setNetworkDown(true));
  window.addEventListener("online", () => setNetworkDown(false));
}

async function netFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init);
    setNetworkDown(false);
    return res;
  } catch {
    setNetworkDown(true);
    throw new NetworkError();
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!session) return false;
  if (session.support) {
    exitSupport(); // la sesión de soporte no se renueva
    return false;
  }
  refreshing ??= (async () => {
    const res = await netFetch("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: session!.refreshToken }),
    });
    if (!res.ok) {
      setSession(null);
      return false;
    }
    setSession((await res.json()) as Session);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Llama a la API con el token de acceso (renovándolo si está por vencer) y reintenta una vez si la sesión venció.
 * @throws ApiError si la respuesta no es exitosa.
 */
export async function api<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  if (session && session.accessTokenExpiresAt - Date.now() < 60_000) await refresh();
  const res = await netFetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry && session && (await refresh())) return api<T>(method, path, body, false);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** GET a la API. */
export const get = <T>(path: string) => api<T>("GET", path);
/** POST a la API con cuerpo JSON (vacío por defecto). */
export const post = <T>(path: string, body?: unknown) => api<T>("POST", path, body ?? {});
/** PATCH a la API. */
export const patch = <T>(path: string, body: unknown) => api<T>("PATCH", path, body);
/** PUT a la API. */
export const put = <T>(path: string, body: unknown) => api<T>("PUT", path, body);
/** DELETE a la API. */
export const del = <T>(path: string) => api<T>("DELETE", path);

/**
 * Arma una cadena de consulta omitiendo los valores vacíos.
 * @returns "" o "?a=1&b=2".
 */
export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** `path` con la query armada desde `params` (los vacíos se omiten). */
export const withQs = (path: string, params: Record<string, string | number | undefined | null>) => path + qs(params);

/** Cuerpo binario (un archivo) con la misma sesión: la API lo recibe tal cual, con su tipo y tamaño. */
export async function apiFile<T>(path: string, file: Blob, retry = true): Promise<T> {
  if (session && session.accessTokenExpiresAt - Date.now() < 60_000) await refresh();
  const res = await netFetch(path, {
    method: "POST",
    headers: {
      "content-type": file.type,
      ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: file,
  });
  if (res.status === 401 && retry && session && (await refresh())) return apiFile<T>(path, file, false);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Descarga un archivo de la API (que pide sesión) como Blob, para usarlo con una URL local. */
export async function getBlob(path: string, retry = true): Promise<Blob> {
  if (session && session.accessTokenExpiresAt - Date.now() < 60_000) await refresh();
  const res = await netFetch(path, { headers: session ? { authorization: `Bearer ${session.accessToken}` } : {} });
  if (res.status === 401 && retry && session && (await refresh())) return getBlob(path, false);
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return res.blob();
}
