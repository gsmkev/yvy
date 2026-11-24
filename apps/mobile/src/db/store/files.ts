/** Fotos y notas de voz locales: cola de subida, almacenamiento y limpieza. */
import { type Ctx } from "./core";

/** Fotos pendientes de subir cuyo registro ya llegó al servidor. */
export function pendingUploads(db: Ctx): { attachmentId: string; photoUri: string; thumbUri: string; attempts: number; mime: string }[] {
  // Solo las que el servidor ya conoce (su mutación salió del outbox).
  return db.sql.all(
    `SELECT f.attachment_id attachmentId, f.photo_uri photoUri, f.thumb_uri thumbUri, f.attempts, a.mime FROM local_files f
     JOIN attachments a ON a.id = f.attachment_id
     WHERE f.uploaded = 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
  );
}

/** Marca una subida como lograda, o suma un intento si falló. */
export function markUploaded(db: Ctx, attachmentId: string, ok: boolean): void {
  if (ok) db.sql.run("UPDATE local_files SET uploaded = 1 WHERE attachment_id = ?", [attachmentId]);
  else db.sql.run("UPDATE local_files SET attempts = attempts + 1 WHERE attachment_id = ?", [attachmentId]);
}

/** Fotos que ya no se reintentan solas por tantos fallos, con lo que pesan. */
export function stuckUploads(db: Ctx, maxAttempts: number): { n: number; bytes: number } {
  return (
    db.sql.get<{ n: number; bytes: number }>(
      `SELECT count(*) n, coalesce(sum(a.bytes), 0) bytes FROM local_files f JOIN attachments a ON a.id = f.attachment_id
       WHERE f.uploaded = 0 AND f.attempts >= ? AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
      [maxAttempts],
    ) ?? { n: 0, bytes: 0 }
  );
}

/** "Reintentar" las fotos trabadas: vuelven a contar desde cero. */
export function retryStuckUploads(db: Ctx, maxAttempts: number): void {
  db.sql.run("UPDATE local_files SET attempts = 0 WHERE uploaded = 0 AND attempts >= ?", [maxAttempts]);
}

/** Cuánto ocupa lo local que se puede medir sin tocar el disco: fotos y notas ya cargadas, mapas bajados. */
export function storageSummary(db: Ctx): { photos: { n: number; bytes: number }; voice: { n: number; bytes: number }; maps: { n: number; bytes: number }; reclaimable: { n: number; bytes: number } } {
  const sum = (where: string) =>
    db.sql.get<{ n: number; bytes: number }>(
      `SELECT count(*) n, coalesce(sum(a.bytes), 0) bytes FROM local_files f JOIN attachments a ON a.id = f.attachment_id WHERE f.photo_uri <> '' AND ${where}`,
    ) ?? { n: 0, bytes: 0 };
  const maps = db.sql.get<{ n: number; bytes: number }>("SELECT count(*) n, coalesce(sum(bytes), 0) bytes FROM offline_packs") ?? { n: 0, bytes: 0 };
  return {
    photos: sum("a.mime NOT LIKE 'audio/%'"),
    voice: sum("a.mime LIKE 'audio/%'"),
    maps,
    reclaimable: sum("f.uploaded = 1"),
  };
}

/** Archivos grandes (foto completa o nota de voz) cuyo original ya está en el servidor: se pueden borrar del celular. */
export function uploadedFiles(db: Ctx): { attachmentId: string; uri: string; bytes: number }[] {
  return db.sql.all(
    `SELECT f.attachment_id attachmentId, f.photo_uri uri, coalesce(a.bytes, 0) bytes FROM local_files f
     JOIN attachments a ON a.id = f.attachment_id
     WHERE f.uploaded = 1 AND f.photo_uri <> '' AND a.upload_status = 'uploaded'
       AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.row_id = f.attachment_id)`,
  );
}

/** Después de borrar los archivos: la fila queda sin ruta (la miniatura se conserva) y se ve desde el servidor. */
export function clearUploadedFiles(db: Ctx, attachmentIds: string[]): void {
  db.sql.tx(() => {
    for (const id of attachmentIds) db.sql.run("UPDATE local_files SET photo_uri = '' WHERE attachment_id = ? AND uploaded = 1", [id]);
  });
}

/** Miniatura local de una foto; null si no está en este celular. */
export function localPhoto(db: Ctx, attachmentId: string): string | null {
  return (
    db.sql.get<{ thumb_uri: string }>("SELECT thumb_uri FROM local_files WHERE attachment_id = ?", [attachmentId])
      ?.thumb_uri ?? null
  );
}
