/** Preferencias por usuario en localStorage (última estancia, pestaña y capa). Nunca rompe si no hay storage. */
import { getSession } from "./api";

export interface Prefs {
  farmId?: string;
  tab?: string;
  layer?: string;
}

const key = () => `yvy.prefs.${getSession()?.user.id ?? "anon"}`;

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(key());
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as Prefs) : {};
  } catch {
    return {};
  }
}

export function savePrefs(patch: Prefs) {
  try {
    localStorage.setItem(key(), JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* modo privado o storage bloqueado */
  }
}
