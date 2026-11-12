/** Almacenamiento del celular (F-19): cuánto ocupa la app y "Borrar fotos ya subidas". */
import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "./db";

export interface StorageUsage {
  photos: { n: number; bytes: number };
  voice: { n: number; bytes: number };
  maps: { n: number; bytes: number };
  database: number;
  /** Lo que "Borrar fotos ya subidas" liberaría ahora. */
  reclaimable: { n: number; bytes: number };
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info && info.exists ? info.size : 0;
}

export async function storageUsage(): Promise<StorageUsage> {
  const { photos, voice, maps, reclaimable } = getDb().storageSummary();
  const dir = `${FileSystem.documentDirectory}SQLite/`;
  // La base y su registro de escritura (WAL) pesan juntos.
  const database = (await Promise.all(["yvy.db", "yvy.db-wal"].map((f) => fileSize(dir + f)))).reduce((a, b) => a + b, 0);
  return { photos, voice, maps, database, reclaimable };
}

/**
 * Borra del celular las fotos completas y notas de voz que ya están en el servidor. Las miniaturas se quedan
 * (pesan poco y mantienen el Historial); lo pendiente de subir nunca se toca. Devuelve cuántos archivos y bytes liberó.
 */
export async function deleteUploadedFiles(): Promise<{ n: number; bytes: number }> {
  const db = getDb();
  const done: string[] = [];
  let bytes = 0;
  for (const f of db.uploadedFiles()) {
    try {
      await FileSystem.deleteAsync(f.uri, { idempotent: true });
      done.push(f.attachmentId);
      bytes += f.bytes;
    } catch {
      // Si un archivo no se pudo borrar, su fila queda como estaba y se reintenta la próxima vez.
    }
  }
  db.clearUploadedFiles(done);
  return { n: done.length, bytes };
}
