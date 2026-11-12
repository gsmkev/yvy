/**
 * "¿Te sirvió?" en los avisos (F-22). alert_feedback no es una tabla sincronizable (no viaja por /sync/push),
 * así que el voto se guarda local en kv y se manda a POST /org/alerts/:id/feedback; si no hay señal queda
 * en una cola que se reintenta después de cada sincronización.
 */
export interface Kv {
  getKv(key: string): string | null;
  setKv(key: string, value: string | null): void;
}

const VOTES = "alert_votes";
const QUEUE = "alert_votes_queue";

const read = <T>(kv: Kv, key: string, empty: T): T => {
  try {
    const raw = kv.getKv(key);
    return raw ? (JSON.parse(raw) as T) : empty;
  } catch {
    return empty;
  }
};

export const readVotes = (kv: Kv): Record<string, boolean> => read(kv, VOTES, {});
export const readQueue = (kv: Kv): Record<string, boolean> => read(kv, QUEUE, {});

/** Guarda el voto local y lo deja en la cola de envío. */
export function recordVote(kv: Kv, alertId: string, useful: boolean): void {
  kv.setKv(VOTES, JSON.stringify({ ...readVotes(kv), [alertId]: useful }));
  kv.setKv(QUEUE, JSON.stringify({ ...readQueue(kv), [alertId]: useful }));
}

/**
 * Manda los votos en cola. `post` lanza si falla; `retryable(e)` dice si hay que conservar el voto
 * (sin señal, error del servidor) o descartarlo (el aviso ya no existe). Corta en el primer fallo reintentable.
 */
export async function flushVotes(
  kv: Kv,
  post: (alertId: string, useful: boolean) => Promise<unknown>,
  retryable: (e: unknown) => boolean,
): Promise<number> {
  let sent = 0;
  for (const [id, useful] of Object.entries(readQueue(kv))) {
    try {
      await post(id, useful);
      sent++;
    } catch (e) {
      if (retryable(e)) break;
    }
    const rest = readQueue(kv);
    // Si mientras tanto cambió el voto, se deja en cola.
    if (rest[id] === useful) delete rest[id];
    kv.setKv(QUEUE, Object.keys(rest).length ? JSON.stringify(rest) : null);
  }
  return sent;
}
