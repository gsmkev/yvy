/**
 * T-08: comentarios y menciones en registros. Tabla sincronizable `comments`: una fila por comentario.
 * Una mención crea un aviso (push y, si la persona tiene email, email) que envía el cron de notificaciones.
 */
import { and, asc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, bumpVersion, currentVersion, runBatch, type DB, type Stmt } from "./client";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "./scoped";

/** Ids que son miembros activos de la organización (descarta al propio autor y los repetidos). */
export async function validMentions(db: DB, orgId: string, authorId: string, ids: string[]): Promise<string[]> {
  const wanted = [...new Set(ids)].filter((i) => i !== authorId).slice(0, LIMITS.comments.maxMentions);
  if (!wanted.length) return [];
  const rows = await db
    .select({ userId: s.memberships.userId })
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.organizationId, orgId),
        inArray(s.memberships.userId, wanted),
        isNull(s.memberships.deletedAt),
        eq(s.memberships.status, "active"),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Avisos de mención: push siempre; email solo para quien tiene (los de campo no tienen). */
export async function mentionStmts(
  db: DB,
  mentions: { commentId: string; userId: string }[],
  now: number,
): Promise<Stmt[]> {
  if (!mentions.length) return [];
  const users = await db
    .select({ id: s.users.id, email: s.users.email })
    .from(s.users)
    .where(inArray(s.users.id, [...new Set(mentions.map((m) => m.userId))]));
  const hasEmail = new Set(users.filter((u) => u.email).map((u) => u.id));
  const rows: (typeof s.notifications.$inferInsert)[] = mentions.flatMap((m) => [
    { id: newId(), userId: m.userId, commentId: m.commentId, channel: "push" as const, createdAt: now },
    ...(hasEmail.has(m.userId)
      ? [{ id: newId(), userId: m.userId, commentId: m.commentId, channel: "email" as const, createdAt: now }]
      : []),
  ]);
  return chunkForParams(rows, Object.keys(getTableColumns(s.notifications)).length).map((c) => db.insert(s.notifications).values(c));
}

async function visibleRecord(sdb: ScopedDb, recordId: string) {
  const [r] = await sdb.db
    .select({ id: s.records.id })
    .from(s.records)
    .where(
      and(
        eq(s.records.id, recordId),
        eq(s.records.organizationId, sdb.auth.orgId),
        isNull(s.records.deletedAt),
        sdb.workerFilter("records"),
      ),
    )
    .limit(1);
  if (!r) throw new NotFoundError("Registro inexistente");
}

export async function listComments(sdb: ScopedDb, recordId: string) {
  await visibleRecord(sdb, recordId);
  return sdb.db
    .select({
      id: s.comments.id,
      authorId: s.comments.authorId,
      authorName: s.comments.authorName,
      body: s.comments.body,
      mentions: s.comments.mentions,
      createdAt: s.comments.createdAt,
    })
    .from(s.comments)
    .where(and(eq(s.comments.recordId, recordId), eq(s.comments.organizationId, sdb.auth.orgId), isNull(s.comments.deletedAt)))
    .orderBy(asc(s.comments.createdAt), asc(s.comments.id));
}

export async function addComment(sdb: ScopedDb, recordId: string, body: string, mentionIds: string[]) {
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
  await visibleRecord(sdb, recordId);
  const [n] = await sdb.db
    .select({ n: sql<number>`count(*)` })
    .from(s.comments)
    .where(and(eq(s.comments.recordId, recordId), isNull(s.comments.deletedAt)));
  if (Number(n?.n ?? 0) >= LIMITS.comments.maxPerRecord) throw new ForbiddenError("El registro ya tiene demasiados comentarios");
  const [u] = await sdb.db.select({ fullName: s.users.fullName }).from(s.users).where(eq(s.users.id, sdb.auth.userId)).limit(1);
  const mentions = await validMentions(sdb.db, sdb.auth.orgId, sdb.auth.userId, mentionIds);
  const id = newId();
  const ts = sdb.now();
  const notify = await mentionStmts(sdb.db, mentions.map((userId) => ({ commentId: id, userId })), ts);
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db.insert(s.comments).values({
      id,
      organizationId: sdb.auth.orgId,
      recordId,
      authorId: sdb.auth.userId,
      authorName: u?.fullName ?? "",
      body,
      mentions: JSON.stringify(mentions),
      createdAt: ts,
      updatedAt: ts,
      version: currentVersion,
    }),
    ...notify,
  ]);
  return { id, mentions };
}

/** Borra el propio comentario; el dueño y el administrador borran cualquiera. */
export async function deleteComment(sdb: ScopedDb, id: string) {
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
  const [c] = await sdb.db
    .select({ authorId: s.comments.authorId, recordId: s.comments.recordId })
    .from(s.comments)
    .where(and(eq(s.comments.id, id), eq(s.comments.organizationId, sdb.auth.orgId), isNull(s.comments.deletedAt)))
    .limit(1);
  if (!c) throw new NotFoundError("No existe");
  await visibleRecord(sdb, c.recordId);
  if (c.authorId !== sdb.auth.userId && !can.manageWorkers(sdb.auth.role))
    throw new ForbiddenError("Solo podés borrar tus comentarios");
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    sdb.db
      .update(s.comments)
      .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
      .where(and(eq(s.comments.id, id), eq(s.comments.organizationId, sdb.auth.orgId))),
  ]);
}
