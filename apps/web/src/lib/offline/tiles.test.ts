import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCacheStorage } from "../../sw/fake-caches";
import { TILE_FILES_CACHE, TILE_RANGES_CACHE } from "../../sw/names";
import { tinyPmtiles } from "../../sw/tiny-pmtiles";
import { clearLocalData } from "./clear";
import { deleteDb, kvGet } from "./db";
import { OfflineQuotaError, planFarm, type OfflinePlan } from "./tilePlan";
import { removeFarm, saveFarm, savedFarms, usage, type Progress } from "./tiles";

const BASE = "https://pub.test";
const farm = (id: string) => ({ id, minLon: -55.96, minLat: -27.21, maxLon: -55.88, maxLat: -27.14 });
const layers = (id: string, size: number) =>
  [{ id: `b-${id}`, layer: "true_color", acquiredAt: 1, pmtilesPath: `layers/${id}/base.pmtiles`, bytes: size, bounds: "" }] as never;

let fakeCaches: FakeCacheStorage;
let requested: string[];
const archive = tinyPmtiles([{ z: 0, x: 0, y: 0, text: "MUNDO" }, { z: 1, x: 0, y: 1, text: "SUR-OESTE" }]);

function stubNetwork(opts: { fail?: (url: string) => boolean } = {}) {
  vi.stubGlobal("fetch", async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    requested.push(url);
    if (opts.fail?.(url)) return new Response("no", { status: 404 });
    const headers = new Headers(init?.headers);
    if (url.endsWith("paraguay.pmtiles")) {
      const m = /bytes=(\d+)-(\d+)/.exec(headers.get("range") ?? "")!;
      const a = Number(m[1]);
      const b = Math.min(Number(m[2]), archive.length - 1);
      return new Response(archive.slice(a, b + 1), { status: 206, headers: { "content-range": `bytes ${a}-${b}/${archive.length}`, "content-length": String(b - a + 1) } });
    }
    const body = new Uint8Array(2048).fill(7);
    return new Response(body, { headers: { "content-type": "application/octet-stream", "content-length": String(body.length) } });
  });
}

beforeEach(async () => {
  await deleteDb();
  fakeCaches = new FakeCacheStorage();
  requested = [];
  vi.stubGlobal("caches", fakeCaches);
  await clearLocalData(); // vacía la copia en memoria de estancias guardadas entre pruebas
  stubNetwork();
});
afterEach(() => vi.unstubAllGlobals());

const plan = (id = "f1", size = 2048): OfflinePlan => planFarm({ farm: farm(id), layers: layers(id, size) } as never, BASE);

describe("guardar una estancia", () => {
  it("baja el archivo entero a la caché, pide teselas del país y deja el registro", async () => {
    const seen: Progress[] = [];
    const entry = await saveFarm(plan(), { onProgress: (p) => seen.push(p) });

    const cache = (await fakeCaches.open(TILE_FILES_CACHE)) as unknown as { entries: Map<string, unknown> };
    expect([...cache.entries.keys()]).toEqual([`${BASE}/layers/f1/base.pmtiles`]);
    expect(entry.files).toEqual([{ url: `${BASE}/layers/f1/base.pmtiles`, bytes: 2048, layerId: "b-f1" }]);
    expect(entry.countryTiles).toBeGreaterThanOrEqual(1); // z0 está en el archivo de prueba
    expect(requested.some((u) => u.endsWith("paraguay.pmtiles"))).toBe(true);

    // se guardó el registro y sobrevive a releer
    expect(Object.keys(await savedFarms())).toEqual(["f1"]);
    expect(Object.keys((await kvGet("offline-farms")) as object)).toEqual(["f1"]);

    // el progreso avanza y nunca pasa del total
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.doneBytes).toBeGreaterThanOrEqual(seen[i - 1]!.doneBytes);
    expect(Math.max(...seen.map((p) => p.doneBytes))).toBeLessThanOrEqual(seen[0]!.totalBytes);
  });

  it("un archivo que ya estaba guardado no se vuelve a bajar", async () => {
    await saveFarm(plan());
    const before = requested.filter((u) => u.includes("base.pmtiles")).length;
    await saveFarm(plan());
    expect(requested.filter((u) => u.includes("base.pmtiles")).length).toBe(before);
  });

  it("si el servidor falla con el mapa, no queda guardada la estancia", async () => {
    stubNetwork({ fail: (u) => u.includes("base.pmtiles") });
    await expect(saveFarm(plan())).rejects.toThrow(/HTTP 404/);
    expect(Object.keys(await savedFarms())).toEqual([]);
  });

  it("el fondo del país es opcional: si no está publicado, la estancia se guarda igual", async () => {
    stubNetwork({ fail: (u) => u.endsWith("paraguay.pmtiles") });
    const e = await saveFarm(plan());
    expect(e.countryTiles).toBe(0);
    expect(Object.keys(await savedFarms())).toEqual(["f1"]);
  });

  it("no entra: avisa con los números y no baja nada", async () => {
    await expect(saveFarm(plan("grande", 400 * 1024 * 1024))).rejects.toBeInstanceOf(OfflineQuotaError);
    expect(requested).toEqual([]);
  });

  it("el tope cuenta todas las estancias guardadas", async () => {
    await saveFarm(plan("f1", 2048));
    const u = await usage();
    expect(u.savedBytes).toBe(2048);
    expect(u.maxBytes).toBeGreaterThan(u.savedBytes);
    await expect(saveFarm(plan("f2", u.maxBytes - 1000))).rejects.toBeInstanceOf(OfflineQuotaError);
  });

  it("cancelar a mitad no deja la estancia a medias", async () => {
    const ctl = new AbortController();
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      ctl.abort();
      if (init?.signal?.aborted) throw new DOMException("cancelado", "AbortError");
      return new Response("x");
    });
    await expect(saveFarm(plan(), { signal: ctl.signal })).rejects.toThrow();
    expect(Object.keys(await savedFarms())).toEqual([]);
  });
});

describe("quitar y borrar", () => {
  it("quitar una estancia borra sus archivos, salvo los que usa otra", async () => {
    const shared = { ...plan("f1"), farmId: "f2" };
    await saveFarm(plan("f1"));
    await saveFarm(shared); // f2 usa el mismo archivo que f1
    const cache = (await fakeCaches.open(TILE_FILES_CACHE)) as unknown as { entries: Map<string, unknown> };
    await removeFarm("f1");
    expect(cache.entries.size).toBe(1); // lo usa f2
    await removeFarm("f2");
    expect(cache.entries.size).toBe(0);
    expect(Object.keys(await savedFarms())).toEqual([]);
  });

  it("cerrar sesión borra archivos, rangos y el registro", async () => {
    await saveFarm(plan());
    await (await fakeCaches.open(TILE_RANGES_CACHE)).put("https://pub.test/x?__range=0-9", new Response("x"));
    await clearLocalData();
    expect(await fakeCaches.keys()).not.toContain(TILE_FILES_CACHE);
    expect(await fakeCaches.keys()).not.toContain(TILE_RANGES_CACHE);
    expect(Object.keys(await savedFarms())).toEqual([]);
  });
});
