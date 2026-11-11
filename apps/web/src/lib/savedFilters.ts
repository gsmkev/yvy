/** Filtros guardados de Registros (U-05): nombre + filtros, por usuario, en localStorage. */
import { getSession } from "./api";

export interface RecordFilterValues {
  farmId: string;
  authorId: string;
  kind: string;
  from: string;
  to: string;
}
export interface SavedFilter {
  id: string;
  name: string;
  filters: RecordFilterValues;
}

export const MAX_SAVED_FILTERS = 20;
const key = () => `yvy.savedFilters.${getSession()?.user.id ?? "anon"}`;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function loadSavedFilters(): SavedFilter[] {
  try {
    const v = JSON.parse(localStorage.getItem(key()) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x): x is Record<string, unknown> =>
          !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string",
      )
      .map((x) => {
        const f = (x.filters ?? {}) as Record<string, unknown>;
        return {
          id: x.id as string,
          name: str(x.name),
          filters: {
            farmId: str(f.farmId),
            authorId: str(f.authorId),
            kind: str(f.kind),
            from: str(f.from),
            to: str(f.to),
          },
        };
      })
      .filter((x) => x.name);
  } catch {
    return [];
  }
}

function write(list: SavedFilter[]) {
  try {
    localStorage.setItem(key(), JSON.stringify(list));
  } catch {
    /* modo privado o storage bloqueado */
  }
}

/** Guarda un filtro; si ya hay uno con ese nombre lo reemplaza. Devuelve la lista nueva. */
export function saveFilter(name: string, filters: RecordFilterValues): SavedFilter[] {
  const clean = name.trim().slice(0, 60);
  const list = loadSavedFilters();
  if (!clean) return list;
  const prev = list.find((x) => x.name.toLowerCase() === clean.toLowerCase());
  const next = prev
    ? list.map((x) => (x === prev ? { ...x, name: clean, filters } : x))
    : [...list, { id: crypto.randomUUID(), name: clean, filters }].slice(-MAX_SAVED_FILTERS);
  write(next);
  return next;
}

export function deleteFilter(id: string): SavedFilter[] {
  const next = loadSavedFilters().filter((x) => x.id !== id);
  write(next);
  return next;
}
