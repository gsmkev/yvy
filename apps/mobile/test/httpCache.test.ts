import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { LocalDb } from "../src/db/store";
import { HttpError, OfflineError } from "../src/lib/errors";
import { ageOf, cacheable, clearCache, invalidateCache, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, readCache, readOnline, writeCache, type KvStore } from "../src/lib/httpCache";
import { nodeSql } from "./node-sql";

const memKv = (): KvStore & { keys(): string[] } => {
  const m = new Map<string, string>();
  return { getKv: (k) => m.get(k) ?? null, setKv: (k, v) => void (v === null ? m.delete(k) : m.set(k, v)), keys: () => [...m.keys()] };
};
const A = { userId: "u1", orgId: "o1" };

describe("copia de lectura de la API (ola 0)", () => {
  it("guarda y lee lo último que bajó, con su hora", () => {
    const kv = memKv();
    expect(writeCache(kv, A, "/org/members", [{ id: 1 }], 1000)).toBe(true);
    expect(readCache(kv, A, "/org/members")).toEqual({ body: [{ id: 1 }], at: 1000 });
    expect(readCache(kv, A, "/org/otra")).toBeNull();
  });

  it("nunca guarda el ERP, la autenticación ni los archivos", () => {
    const kv = memKv();
    for (const p of ["/org/erp/stock", "/org/erp", "/org/erp/costs?farmId=x", "/auth/refresh", "/media/attachments/1"]) {
      expect(cacheable(p)).toBe(false);
      expect(writeCache(kv, A, p, { gs: 1 }, 1)).toBe(false);
    }
    expect(kv.keys()).toEqual([]);
    expect(cacheable("/org/dashboard")).toBe(true);
    expect(cacheable("/org/erpish")).toBe(true);
  });

  it("no sirve lo de otra persona ni lo de otra organización", () => {
    const kv = memKv();
    writeCache(kv, A, "/org/review", ["x"], 1);
    expect(readCache(kv, { userId: "u2", orgId: "o1" }, "/org/review")).toBeNull();
    expect(readCache(kv, { userId: "u1", orgId: "o2" }, "/org/review")).toBeNull();
  });

  it("descarta una entrada demasiado grande", () => {
    const kv = memKv();
    expect(writeCache(kv, A, "/org/records", "x".repeat(MAX_ENTRY_BYTES + 1), 1)).toBe(false);
    expect(readCache(kv, A, "/org/records")).toBeNull();
  });

  it("al pasar el tope total se van las más viejas y se queda la nueva", () => {
    const kv = memKv();
    const chunk = "y".repeat(MAX_ENTRY_BYTES - 100);
    const n = Math.ceil(MAX_TOTAL_BYTES / MAX_ENTRY_BYTES) + 2;
    for (let i = 0; i < n; i++) writeCache(kv, A, `/org/p${i}`, chunk, 1000 + i);
    expect(readCache(kv, A, "/org/p0")).toBeNull();
    expect(readCache(kv, A, `/org/p${n - 1}`)).not.toBeNull();
    const total = kv.keys().filter((k) => k.startsWith("http:")).reduce((a, k) => a + kv.getKv(k)!.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });

  it("invalida por prefijo y borra todo al cerrar", () => {
    const kv = memKv();
    writeCache(kv, A, "/org/tasks?status=open", [], 1);
    writeCache(kv, A, "/org/tasks?status=done", [], 1);
    writeCache(kv, A, "/org/members", [], 1);
    expect(invalidateCache(kv, A, "/org/tasks")).toBe(2);
    expect(readCache(kv, A, "/org/tasks?status=open")).toBeNull();
    expect(readCache(kv, A, "/org/members")).not.toBeNull();
    clearCache(kv);
    expect(kv.keys()).toEqual([]);
  });

  it("cerrar sesión en la base local borra también la copia de lectura", () => {
    const db = new LocalDb(nodeSql());
    db.migrate();
    writeCache(db, { userId: newId(), orgId: newId() }, "/org/dashboard", { rain: 1 }, 5);
    expect(db.sql.all("SELECT key FROM kv WHERE key LIKE 'http:%'")).toHaveLength(1);
    db.wipeSynced();
    expect(db.sql.all("SELECT key FROM kv WHERE key LIKE 'http%'")).toHaveLength(0);
  });
});

describe("antigüedad", () => {
  it("elige la unidad más corta", () => {
    const now = 10_000_000_000;
    expect(ageOf(now - 20_000, now)).toEqual({ unit: "now" });
    expect(ageOf(now - 15 * 60_000, now)).toEqual({ unit: "min", n: 15 });
    expect(ageOf(now - 2 * 3_600_000, now)).toEqual({ unit: "h", n: 2 });
    expect(ageOf(now - 3 * 86_400_000, now)).toEqual({ unit: "d", n: 3 });
    expect(ageOf(now + 5000, now)).toEqual({ unit: "now" });
  });
});

describe("leer con respaldo", () => {
  const base = { scope: A, now: 1_000_000 };

  it("sin copia pide a la red y la guarda", async () => {
    const kv = memKv();
    const r = await readOnline(kv, "/org/dashboard", async () => ({ n: 1 }), base);
    expect(r).toEqual({ data: { n: 1 }, at: 1_000_000, fromCache: false, offline: false, error: null });
    expect(readCache(kv, A, "/org/dashboard")?.body).toEqual({ n: 1 });
  });

  it("con la copia fresca no vuelve a pedir", async () => {
    const kv = memKv();
    writeCache(kv, A, "/x", { v: 1 }, 999_000);
    let calls = 0;
    const r = await readOnline(kv, "/x", async () => (calls++, { v: 2 }), base);
    expect(calls).toBe(0);
    expect(r.data).toEqual({ v: 1 });
    expect(r.fromCache).toBe(true);
  });

  it("con la copia vencida o forzada refresca", async () => {
    const kv = memKv();
    writeCache(kv, A, "/x", { v: 1 }, 1);
    expect((await readOnline(kv, "/x", async () => ({ v: 2 }), base)).data).toEqual({ v: 2 });
    writeCache(kv, A, "/x", { v: 1 }, 999_999);
    expect((await readOnline(kv, "/x", async () => ({ v: 3 }), { ...base, force: true })).data).toEqual({ v: 3 });
  });

  it("sin señal conserva lo guardado y lo dice; sin copia queda vacío", async () => {
    const kv = memKv();
    writeCache(kv, A, "/x", { v: 1 }, 1);
    const off = async () => {
      throw new OfflineError("Sin señal");
    };
    const r = await readOnline(kv, "/x", off, base);
    expect(r).toEqual({ data: { v: 1 }, at: 1, fromCache: true, offline: true, error: null });
    const none = await readOnline(kv, "/otra", off, base);
    expect(none).toEqual({ data: null, at: null, fromCache: false, offline: true, error: null });
  });

  it("con error del servidor devuelve el motivo y conserva la copia", async () => {
    const kv = memKv();
    writeCache(kv, A, "/x", { v: 1 }, 1);
    const r = await readOnline(
      kv,
      "/x",
      async () => {
        throw new HttpError(403, "Solo el dueño");
      },
      base,
    );
    expect(r.error).toEqual({ status: 403, message: "Solo el dueño" });
    expect(r.data).toEqual({ v: 1 });
  });

  it("puede guardar una versión recortada (sin montos) y mostrar la completa", async () => {
    const kv = memKv();
    const full = { margin: { gs: 123 }, rain: 4 };
    const r = await readOnline(kv, "/org/dashboard", async () => full, { ...base, forCache: (b: typeof full) => ({ ...b, margin: null }) });
    expect(r.data).toEqual(full);
    expect(readCache(kv, A, "/org/dashboard")?.body).toEqual({ margin: null, rain: 4 });
  });
});
