/**
 * Nombres de los miembros de la organización, para mostrar quién anotó cada registro (F-29).
 * La base local no tiene usuarios: se guarda una lista corta {id: nombre} en kv y se renueva con señal.
 */
import type { LocalDb } from "../db/store";

const KEY = "member_names";
const AT_KEY = "member_names_at";
export const MEMBERS_TTL_MS = 6 * 60 * 60 * 1000;

export function memberNames(db: LocalDb): Record<string, string> {
  try {
    return JSON.parse(db.getKv(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Baja la lista si está vencida. Sin señal o con error deja la que había: nunca rompe la sincronización. */
export async function refreshMemberNames(
  db: LocalDb,
  fetchMembers: () => Promise<{ userId: string; fullName: string }[]>,
  now: number = Date.now(),
): Promise<boolean> {
  const at = Number(db.getKv(AT_KEY) ?? 0);
  if (at && now - at < MEMBERS_TTL_MS) return false;
  try {
    const rows = await fetchMembers();
    db.setKv(KEY, JSON.stringify(Object.fromEntries(rows.map((m) => [m.userId, m.fullName]))));
    db.setKv(AT_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
