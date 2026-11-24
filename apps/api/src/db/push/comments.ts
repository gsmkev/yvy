/** Manejadores del push para los comentarios de los registros. */

import type { Mutation } from "@yvy/shared";
import { can } from "../scoped";
import type { PushCtx } from "./context";

type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;

/** Alta o edición de un comentario propio; las menciones se resuelven al armar las escrituras. */
export function commentsUpsert(ctx: PushCtx, m: Of<"comments.upsert">): void {
  const c = m.row;
  const { org, now, userId, out } = ctx;
  const prev = ctx.commentsById.get(c.id);
  if (prev && (prev.organizationId !== org || prev.authorId !== userId || prev.recordId !== c.recordId))
    return ctx.reject(m, prev.organizationId !== org ? "not_found" : "forbidden");
  if (prev?.deletedAt) return ctx.reject(m, "deleted");
  if (!ctx.visibleForComments.has(c.recordId)) return ctx.reject(m, "not_found", "record");
  const mentions = c.mentions.filter((u) => ctx.validMentioned.has(u));
  if (!prev) mentions.forEach((u) => out.mentionRows.push({ commentId: c.id, userId: u }));
  out.commentUpserts.push({
    id: c.id,
    organizationId: org,
    recordId: c.recordId,
    authorId: userId,
    authorName: ctx.authorName,
    body: c.body,
    mentions: JSON.stringify(mentions),
    createdAt: now,
    updatedAt: now,
  });
  ctx.commentsById.set(c.id, { id: c.id, organizationId: org, authorId: userId, recordId: c.recordId, deletedAt: null });
  ctx.accept(m, c.id);
}

/** Baja de un comentario: lo puede hacer su autor o quien gestiona al equipo. */
export function commentsDelete(ctx: PushCtx, m: Of<"comments.delete">): void {
  const prev = ctx.commentsById.get(m.row.id);
  if (!prev || prev.organizationId !== ctx.org) return ctx.reject(m, "not_found");
  if (prev.authorId !== ctx.userId && !can.manageWorkers(ctx.role)) return ctx.reject(m, "forbidden");
  if (!prev.deletedAt) {
    ctx.out.commentDeletes.push(prev.id);
    prev.deletedAt = ctx.now;
  }
  ctx.accept(m, prev.id);
}
