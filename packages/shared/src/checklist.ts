/**
 * Listas de verificación en tareas (F-15). Se guardan como JSON en tasks.checklist; el empleado tilda ítems
 * sin señal y cada tilde viaja como una mutación `tasks.check` (id de tarea + id de ítem), así dos celulares
 * que tildan ítems distintos no se pisan.
 */
import { z } from "zod";
import { LIMITS } from "./limits";

export const checklistItemSchema = z.object({
  id: z.string().min(1).max(24),
  text: z.string().trim().min(1).max(LIMITS.checklist.maxTextLength),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistSchema = z.array(checklistItemSchema).max(LIMITS.checklist.maxItems);

/** Texto de cada ítem → lista nueva, con ids estables por posición. Ignora líneas vacías. */
export function newChecklist(texts: readonly string[]): ChecklistItem[] {
  return texts
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, LIMITS.checklist.maxItems)
    .map((text, i) => ({ id: `i${i + 1}`, text: text.slice(0, LIMITS.checklist.maxTextLength), done: false }));
}

/** Lee la columna JSON; ante un valor roto devuelve lista vacía en vez de tirar la pantalla. */
export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const r = checklistSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

export const serializeChecklist = (list: readonly ChecklistItem[]): string | null => (list.length ? JSON.stringify(list) : null);

/** Devuelve la lista con el ítem tildado o destildado, o null si el ítem no existe. */
export function setChecklistItem(list: readonly ChecklistItem[], itemId: string, done: boolean): ChecklistItem[] | null {
  if (!list.some((i) => i.id === itemId)) return null;
  return list.map((i) => (i.id === itemId ? { ...i, done } : i));
}

export const checklistProgress = (list: readonly ChecklistItem[]) => ({
  done: list.filter((i) => i.done).length,
  total: list.length,
});

/** La repetición de una tarea nace con la lista sin tildar. */
export const resetChecklist = (list: readonly ChecklistItem[]): ChecklistItem[] => list.map((i) => ({ ...i, done: false }));
