/**
 * Analítica propia (P-03). Los pasos del embudo los escribe el servidor en la misma transacción que la acción,
 * una sola vez por organización (índice único parcial + ON CONFLICT DO NOTHING): sin lecturas extra, sin usuario.
 */
import { newId, type FUNNEL_EVENTS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB, Stmt } from "./client";

export const funnelEvent = (
  db: DB,
  name: (typeof FUNNEL_EVENTS)[number],
  organizationId: string,
  ts: number,
): Stmt => db.insert(s.events).values({ id: newId(), name, organizationId, ts }).onConflictDoNothing();
