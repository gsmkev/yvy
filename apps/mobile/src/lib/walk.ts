/**
 * Recorrida GPS a pedido (F-05). Solo graba entre "Empezar" y "Terminar", con la app abierta:
 * no usa servicio en segundo plano. La barra visible (ui/WalkBanner) está siempre mientras graba.
 * Cada tanto se guarda un borrador en kv: si el sistema cierra la app, la recorrida se puede recuperar y guardar.
 */
import { useSyncExternalStore } from "react";
import * as Location from "expo-location";
import { LIMITS } from "@yvy/shared";
import { getDb } from "./db";
import { addFix, buildTrack, newDraft, parseDraft, serializeDraft, type WalkDraft } from "./walkTracker";

const DRAFT_KEY = "walk_draft";
const CHECKPOINT_EVERY = 10;

interface State {
  recording: boolean;
  draft: WalkDraft | null;
}
let state: State = { recording: false, draft: null };
let sub: { remove: () => void } | null = null;
const subs = new Set<() => void>();
const set = (s: State) => {
  state = s;
  subs.forEach((f) => f());
};

export const useWalk = (): State =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
  );

/** Empieza a grabar. "denied" si no hay permiso de ubicación. Con una recorrida ya en curso no hace nada. */
export async function startWalk(now = Date.now()): Promise<"ok" | "denied"> {
  if (state.recording) return "ok";
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return "denied";
  set({ recording: true, draft: newDraft(now) });
  getDb().setKv(DRAFT_KEY, serializeDraft(state.draft!));
  try {
    sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: LIMITS.track.sampleIntervalMs,
        distanceInterval: LIMITS.track.sampleDistanceM,
      },
      (p) => {
        if (!state.recording || !state.draft) return;
        const before = state.draft.points.length;
        const next = addFix(state.draft, {
          lon: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: typeof p.coords.accuracy === "number" && p.coords.accuracy > 0 ? p.coords.accuracy : null,
          at: p.timestamp,
        });
        if (next === state.draft) return;
        set({ recording: true, draft: next });
        if (next.points.length !== before && next.points.length % CHECKPOINT_EVERY === 0) getDb().setKv(DRAFT_KEY, serializeDraft(next));
      },
    );
  } catch {
    set({ recording: false, draft: null });
    getDb().setKv(DRAFT_KEY, null);
    return "denied";
  }
  return "ok";
}

/** Apaga el GPS y devuelve lo grabado (el borrador queda hasta que se guarde o descarte). */
export function stopWalk(): WalkDraft | null {
  sub?.remove();
  sub = null;
  const draft = state.draft;
  if (draft) getDb().setKv(DRAFT_KEY, serializeDraft(draft));
  set({ recording: false, draft });
  return draft;
}

export function discardWalk(): void {
  sub?.remove();
  sub = null;
  getDb().setKv(DRAFT_KEY, null);
  set({ recording: false, draft: null });
}

/** Borrador que quedó de una sesión anterior (la app se cerró grabando). */
export function recoverDraft(): WalkDraft | null {
  if (state.recording) return null;
  return state.draft ?? parseDraft(getDb().getKv(DRAFT_KEY));
}

export { buildTrack };
