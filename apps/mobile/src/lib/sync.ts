/**
 * Sincronización del celular (PRD §11, RF-41/43): al abrir la app, al volver la señal, cada 30 min en
 * primer plano y con "Sincronizar ahora". Un solo ciclo a la vez (lo garantiza SyncEngine).
 */
import { AppState } from "react-native";
import * as Network from "expo-network";
import * as FileSystem from "expo-file-system/legacy";
import { useSyncExternalStore } from "react";
import { LIMITS } from "@yvy/shared";
import { CpuLimitError, httpTransport, SyncEngine, type AttachmentUploader } from "@yvy/sync";
import { getDb } from "./db";
import { flushVotes } from "./votes";
import { rescheduleReminders } from "./reminders";
import { accessToken, api, API_URL, getSession, HttpError, OfflineError } from "./session";

export interface SyncStatus {
  online: boolean;
  phase: "idle" | "syncing";
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
  version: number; // sube en cada cambio de datos locales, para refrescar pantallas
}

let status: SyncStatus = { online: true, phase: "idle", pending: 0, lastSyncAt: null, error: null, version: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<SyncStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );

/** Llamar después de cada escritura local. */
export const localChanged = () => set({ pending: getDb().pendingCount(), version: status.version + 1 });

const MAX_UPLOAD_ATTEMPTS = 8;

/** "Mandar por datos móviles": salta la regla "fotos solo con wifi" durante un solo ciclo. */
let mobileDataOnce = false;

const uploader: AttachmentUploader = {
  async uploadPending() {
    const db = getDb();
    if (db.getKv("photos_wifi_only") === "1" && !mobileDataOnce) {
      const net = await Network.getNetworkStateAsync();
      if (net.type !== Network.NetworkStateType.WIFI) return 0;
    }
    let done = 0;
    for (const f of db.pendingUploads()) {
      if (f.attempts >= MAX_UPLOAD_ATTEMPTS) continue;
      try {
        const urls = await api<{ photo: string; thumb: string }>(
          "POST",
          `/media/attachments/${f.attachmentId}/upload-url`,
        );
        for (const [url, uri] of [
          [urls.photo, f.photoUri],
          [urls.thumb, f.thumbUri],
        ] as const) {
          const r = await FileSystem.uploadAsync(url, uri, {
            httpMethod: "PUT",
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { "content-type": "image/webp" },
          });
          if (r.status >= 300) throw new HttpError(r.status, "upload");
        }
        await api("POST", `/media/attachments/${f.attachmentId}/uploaded`);
        db.markUploaded(f.attachmentId, true);
        done++;
      } catch (e) {
        if (e instanceof OfflineError) break;
        db.markUploaded(f.attachmentId, false);
      }
    }
    return done;
  },
};

let engine: SyncEngine | null = null;
function getEngine(): SyncEngine {
  engine ??= new SyncEngine({
    store: getDb(),
    deviceId: deviceId(),
    uploader,
    transport: httpTransport({ baseUrl: API_URL, getAccessToken: accessToken }),
  });
  return engine;
}

export function deviceId(): string {
  const db = getDb();
  let id = db.getKv("device_id");
  if (!id) {
    id = `and-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    db.setKv("device_id", id);
  }
  return id;
}

/** Manda los "¿Te sirvió?" que quedaron en cola. Errores 4xx (salvo 401/429) descartan el voto; el resto lo reintenta. */
export const flushAlertVotes = (): Promise<number> =>
  flushVotes(
    getDb(),
    (id, useful) => api("POST", `/org/alerts/${id}/feedback`, { useful }),
    (e) => !(e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429),
  ).catch(() => 0);

export async function syncNow(): Promise<void> {
  if (!getSession()) return;
  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net && net.isInternetReachable === false) {
    set({ online: false, pending: getDb().pendingCount() });
    return;
  }
  set({ phase: "syncing", error: null });
  try {
    const r = await getEngine().sync();
    getDb().setKv("last_sync_at", String(r.finishedAt));
    set({ online: true, lastSyncAt: r.finishedAt });
    await flushAlertVotes();
  } catch (e) {
    const offline =
      e instanceof OfflineError ||
      e instanceof TypeError ||
      (e instanceof Error && /Network request failed/.test(e.message));
    set({
      online: !offline,
      error: offline ? null : e instanceof CpuLimitError ? "cpu" : e instanceof Error ? e.message : String(e),
    });
  } finally {
    set({ phase: "idle", pending: getDb().pendingCount(), version: status.version + 1 });
    void rescheduleReminders(); // F-16: las tareas pudieron cambiar
  }
}

/** Sincroniza ya, incluso las fotos aunque esté activado "solo con wifi" (una sola vez). */
export async function syncNowMobileData(): Promise<void> {
  mobileDataOnce = true;
  try {
    await syncNow();
  } finally {
    mobileDataOnce = false;
  }
}

let started = false;
let stopCurrent: (() => void) | null = null;

/** Cierre de sesión: detiene los disparadores y descarta el motor, así otra persona arranca limpia. */
export function stopAutoSync(): void {
  stopCurrent?.();
  engine = null;
  set({ phase: "idle", pending: 0, lastSyncAt: null, error: null, online: true, version: status.version + 1 });
}

/** Arranca los disparadores automáticos. Idempotente. */
export function startAutoSync(): () => void {
  if (started) return () => {};
  started = true;
  const last = getDb().getKv("last_sync_at");
  set({ pending: getDb().pendingCount(), lastSyncAt: last ? Number(last) : null });
  syncNow();
  const interval = setInterval(() => AppState.currentState === "active" && syncNow(), LIMITS.sync.autoSyncIntervalMs);
  const appSub = AppState.addEventListener("change", (s) => s === "active" && syncNow());
  let wasOnline = true;
  const netSub = Network.addNetworkStateListener((n) => {
    const online = n.isInternetReachable !== false && n.isConnected !== false;
    set({ online });
    if (online && !wasOnline) syncNow();
    wasOnline = online;
  });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    appSub.remove();
    netSub.remove();
    started = false;
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}
