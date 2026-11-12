/**
 * Celular compartido (F-25): cambiar de usuario.
 *
 * Decisión: NO se guardan varias sesiones en el celular. Lo pendiente de cada persona se manda con SU sesión (el
 * servidor decide permisos y autoría por el token), y las tablas locales (lotes asignados, tareas) son de un solo
 * usuario: mezclar dos en una misma base mostraría datos de uno al otro y obligaría a mandar con un token que no
 * corresponde. Sin señal no se puede renovar ni cambiar de sesión con seguridad, así que se bloquea el cambio mientras
 * quede algo sin mandar, se explica por qué, y lo anotado queda a salvo en el celular hasta que haya señal.
 */
import type { LocalDb } from "../db/store";

export interface UnsentSummary {
  /** Mutaciones en la cola de envío (registros, tareas, puntos). */
  mutations: number;
  /** Fotos y notas de voz que el servidor conoce pero todavía no se subieron. */
  uploads: number;
  /** Mutaciones que el servidor rechazó y siguen guardadas hasta que la persona las descarte. */
  rejected: number;
}

export const unsentSummary = (db: LocalDb): UnsentSummary => ({
  mutations: db.pendingCount(),
  uploads: db.pendingUploads().length,
  rejected: db.rejected().length,
});

export type SwitchBlock = { blocked: false } | { blocked: true; reason: "pending" | "rejected"; n: number };

/** ¿Se puede cambiar de usuario (o cerrar sesión) sin perder ni mezclar nada? */
export function canSwitchUser(u: UnsentSummary): SwitchBlock {
  const pending = u.mutations + u.uploads;
  if (pending > 0) return { blocked: true, reason: "pending", n: pending };
  if (u.rejected > 0) return { blocked: true, reason: "rejected", n: u.rejected };
  return { blocked: false };
}
