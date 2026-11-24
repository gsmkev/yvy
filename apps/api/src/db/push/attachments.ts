/** Manejadores del push para los adjuntos (fotos y notas de voz) de los registros. */

import { eq } from "drizzle-orm";
import { LIMITS, isAudioMime, type Mutation } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { countKey, type PushCtx } from "./context";

type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;

/** Rutas en R2. La nota de voz es un solo archivo .m4a: no tiene miniatura (thumbPath vacío). */
const attachmentPaths = (orgId: string, recordId: string, attachmentId: string, mime: string = "image/webp") =>
  isAudioMime(mime)
    ? { storagePath: `organizations/${orgId}/records/${recordId}/${attachmentId}.m4a`, thumbPath: "" }
    : {
        storagePath: `organizations/${orgId}/records/${recordId}/${attachmentId}.webp`,
        thumbPath: `organizations/${orgId}/records/${recordId}/${attachmentId}_t.webp`,
      };

/** Alta de un adjunto: valida el registro, el límite del plan y deja la fila pendiente de subir a R2. */
export function attachmentsUpsert(ctx: PushCtx, m: Of<"attachments.upsert">): void {
  const a = m.row;
  const { org, now } = ctx;
  const rec = ctx.records.get(a.recordId);
  if (!rec || rec.organizationId !== org) return ctx.reject(m, "not_found", "record");
  if (rec.deletedAt) return ctx.reject(m, "deleted");
  const err = !ctx.farmWritable(rec.farmId) ? "forbidden" : ctx.sdb.canEditRecord(rec);
  if (err) return ctx.reject(m, err);
  const existing = ctx.attachments.get(a.id);
  if (existing && (existing.organizationId !== org || existing.recordId !== a.recordId)) return ctx.reject(m, "not_found");
  if (!existing) {
    const key = countKey(a.recordId, a.mime);
    const n = ctx.attachCount.get(key) ?? 0;
    if (n >= (isAudioMime(a.mime) ? LIMITS.audio.maxPerRecord : LIMITS.photos.maxPerRecord)) {
      return ctx.reject(m, "too_many_attachments");
    }
    ctx.attachCount.set(key, n + 1);
    ctx.attachments.set(a.id, { id: a.id, organizationId: org, recordId: a.recordId, deletedAt: null });
  }
  ctx.out.attachmentUpserts.push({
    id: a.id,
    organizationId: org,
    recordId: a.recordId,
    ...attachmentPaths(org, a.recordId, a.id, a.mime),
    mime: a.mime,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    createdAt: now,
    updatedAt: now,
  });
  ctx.accept(m, a.id);
}

/** Baja (lógica) de un adjunto. */
export async function attachmentsDelete(ctx: PushCtx, m: Of<"attachments.delete">): Promise<void> {
  const existing = ctx.attachments.get(m.row.id);
  const rec = existing && ctx.records.get(existing.recordId);
  if (!existing || existing.organizationId !== ctx.org) return ctx.reject(m, "not_found");
  if (!existing.deletedAt) {
    // Si el registro no vino en las lecturas, alcanza con que el adjunto sea de la organización
    // y el usuario pueda editar; lo resolvemos con una lectura puntual.
    const owner =
      rec ??
      (
        await ctx.db
          .select({
            organizationId: s.records.organizationId,
            farmId: s.records.farmId,
            authorId: s.records.authorId,
            createdAt: s.records.createdAt,
            deletedAt: s.records.deletedAt,
            lon: s.records.lon,
            lat: s.records.lat,
          })
          .from(s.records)
          .where(eq(s.records.id, existing.recordId))
          .limit(1)
      )[0];
    const err = !owner ? "not_found" : !ctx.farmWritable(owner.farmId) ? "forbidden" : ctx.sdb.canEditRecord(owner);
    if (err) return ctx.reject(m, err);
    ctx.out.attachmentDeletes.push(m.row.id);
    existing.deletedAt = ctx.now;
  }
  ctx.accept(m, m.row.id);
}
