/**
 * IndexedDB de la web sin conexión (ADR 0005): una sola base `yvy-offline` con
 *  - kv:     cursores, fecha del último envío, dueño de lo guardado y la copia de lecturas de TanStack Query;
 *  - outbox: mutaciones pendientes, rechazadas y recién enviadas (clave = mutationId, UUIDv7: ordena por creación);
 *  - rows:   filas bajadas con el pull (clave [tabla, id]).
 * Cambiar la forma de lo guardado exige subir WEB_OFFLINE_SCHEMA.
 */
import { onClearLocalData } from "./clear";

export const DB_NAME = "yvy-offline";
export const WEB_OFFLINE_SCHEMA = 1;
export const STORES = ["kv", "outbox", "rows"] as const;
export type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, WEB_OFFLINE_SCHEMA);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "mutationId" });
      if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows");
    };
    req.onsuccess = () => {
      const db = req.result;
      // Otra pestaña pide borrar o actualizar la base: se cierra para no bloquearla.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB no disponible"));
    req.onblocked = () => reject(new Error("IndexedDB bloqueada por otra pestaña"));
  }).catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}

export const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export type Stores = Record<StoreName, IDBObjectStore>;

/**
 * Una transacción: `work` solo puede esperar pedidos de IndexedDB (con otra promesa en el medio la transacción se
 * cierra sola). Devuelve lo que devuelva `work` una vez que se confirmó TODO; si algo falla, no queda nada escrito.
 */
export async function run<T>(names: readonly StoreName[], mode: IDBTransactionMode, work: (s: Stores) => Promise<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction([...names], mode);
    const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(n)])) as Stores;
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transacción cancelada"));
    work(stores).then(
      (r) => {
        result = r;
      },
      (e) => {
        reject(e);
        try {
          tx.abort();
        } catch {
          /* ya cerrada */
        }
      },
    );
  });
}

export const kvGet = <T>(key: string): Promise<T | undefined> => run(["kv"], "readonly", (s) => req<T | undefined>(s.kv.get(key)));
export const kvSet = (key: string, value: unknown): Promise<void> =>
  run(["kv"], "readwrite", async (s) => void (await req(s.kv.put(value, key))));
export const kvDel = (key: string): Promise<void> => run(["kv"], "readwrite", async (s) => void (await req(s.kv.delete(key))));

/** Borra toda la base (cerrar sesión, cambiar de organización). */
export async function deleteDb(): Promise<void> {
  const open = opening;
  opening = null;
  if (open) {
    try {
      (await open).close();
    } catch {
      /* no llegó a abrir */
    }
  }
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve(); // otra pestaña la cierra al recibir versionchange y el borrado sigue solo
  });
}

if (typeof indexedDB !== "undefined") onClearLocalData(deleteDb);
