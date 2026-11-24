/** Tabla de manejadores del protocolo de sync: un manejador por tipo de mutación (sync-protocol.ts). */
import type { Mutation } from "@yvy/shared";
import type { PushCtx } from "./context";
import { recordsUpsert, recordsDelete } from "./records";
import { attachmentsUpsert, attachmentsDelete } from "./attachments";
import { tasksStatus, tasksComment, tasksCheck } from "./tasks";
import { poisUpsert, plotsUpsert } from "./spatial";
import { commentsUpsert, commentsDelete } from "./comments";

type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;
type Handlers = { [K in Mutation["kind"]]: (ctx: PushCtx, m: Of<K>) => void | Promise<void> };

const HANDLERS: Handlers = {
  "records.upsert": recordsUpsert,
  "records.delete": recordsDelete,
  "attachments.upsert": attachmentsUpsert,
  "attachments.delete": attachmentsDelete,
  "tasks.status": tasksStatus,
  "tasks.check": tasksCheck,
  "tasks.comment": tasksComment,
  "pois.upsert": poisUpsert,
  "plots.upsert": plotsUpsert,
  "comments.upsert": commentsUpsert,
  "comments.delete": commentsDelete,
};

const handlers = new Map(Object.entries(HANDLERS) as [Mutation["kind"], (ctx: PushCtx, m: Mutation) => void | Promise<void>][]);

/** Decide una mutación: duplicada o la deriva a su manejador, que la acepta o la rechaza con motivo. */
export async function decide(ctx: PushCtx, m: Mutation): Promise<void> {
  if (ctx.seen.has(m.mutationId)) {
    ctx.results.push({ mutationId: m.mutationId, status: "duplicate" });
    return;
  }
  await handlers.get(m.kind)!(ctx, m);
}
