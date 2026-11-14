// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PMTiles } from "pmtiles";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeCacheStorage } from "./fake-caches";
import { classify, createHandlers, type PrecacheManifest } from "./handlers";
import { DATA_CACHE, FROM_CACHE_HEADER, SAVED_AT_HEADER, SHELL_PREFIX, TILE_FILES_CACHE, TILE_RANGES_CACHE } from "./names";
import { isCacheableData, isPersistableQueryKey, isWorkerFirst, WORKER_FIRST } from "./policy";

const ORIGIN = "https://yvy.test";
const TILES = "https://pub-x.r2.dev/layers/f1/ndvi.pmtiles";
const manifest: PrecacheManifest = {
  version: "abc123",
  urls: ["/", "/assets/index-1.js", "/assets/index-1.css", "/manifest.webmanifest", "/icon-192.png"],
  critical: ["/", "/assets/index-1.js", "/manifest.webmanifest"],
};

interface World {
  caches: FakeCacheStorage;
  online: boolean;
  fetched: string[];
  respond: (req: Request) => Response;
  waits: Promise<unknown>[];
  h: ReturnType<typeof createHandlers>;
  call: (url: string, init?: RequestInit & { mode?: RequestMode }) => Promise<Response>;
}

function world(): World {
  const w = {
    caches: new FakeCacheStorage(),
    online: true,
    fetched: [] as string[],
    waits: [] as Promise<unknown>[],
    respond: (req: Request) => new Response(`net:${new URL(req.url).pathname}`),
  } as World;
  w.h = createHandlers({
    caches: w.caches.asStorage(),
    origin: ORIGIN,
    precache: manifest,
    now: () => 1_700_000_000_000,
    fetch: async (req) => {
      w.fetched.push(req.url);
      if (!w.online) throw new TypeError("Failed to fetch");
      return w.respond(req);
    },
  });
  w.call = async (url, init) => {
    // Node no deja crear un Request de navegación: se arma uno a mano con lo que mira el service worker.
    const req =
      init?.mode === "navigate"
        ? ({ method: "GET", url, mode: "navigate", headers: new Headers() } as unknown as Request)
        : new Request(url, init);
    const p = w.h.handle(req, (x) => w.waits.push(x));
    if (!p) throw new Error("no lo maneja el service worker");
    const res = await p;
    await Promise.all(w.waits);
    return res;
  };
  return w;
}

const req = (path: string, mode: RequestMode = "cors", method = "GET") => ({ method, url: `${ORIGIN}${path}`, mode });
const pre = new Set(manifest.urls);
const cls = (path: string, mode?: RequestMode, method?: string) => classify(req(path, mode, method), ORIGIN, pre);

describe("classify", () => {
  it("las navegaciones de la app y los assets son de la cáscara", () => {
    expect(cls("/estancias/abc", "navigate")).toBe("navigate");
    expect(cls("/", "navigate")).toBe("navigate");
    expect(cls("/assets/lazy-9.js")).toBe("asset");
    expect(cls("/icon-192.png")).toBe("asset");
    expect(cls("/manifest.webmanifest")).toBe("asset");
  });
  it("GET /org/* y /me tienen copia de respaldo; el resto de la API no se toca", () => {
    expect(cls("/org/farms")).toBe("data");
    expect(cls("/org/records")).toBe("data");
    expect(cls("/me")).toBe("data");
    for (const p of ["/auth/refresh", "/sync/push", "/media/x", "/ingest/x", "/admin/x", "/public/x", "/v1/x", "/events", "/devices", "/health", "/descargar-app", "/me/totp"])
      expect(cls(p), p).toBeNull();
    for (const p of ["/auth/google", "/descargar-app", "/org/farms"]) expect(cls(p, "navigate") === "navigate", p).toBe(false);
  });
  it("las escrituras nunca pasan por el service worker", () => {
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(cls("/org/tasks", "cors", m)).toBeNull();
      expect(cls("/assets/a.js", "cors", m)).toBeNull();
    }
  });
  it("no copia ERP, administración ni secretos", () => {
    for (const p of [
      "/org/erp/purchases",
      "/org/erp/results?farmId=1",
      "/org/api-tokens",
      "/org/webhooks",
      "/org/security",
      "/org/members/u1/pin",
      "/org/farms/f1/share-links",
      "/org/plan",
      "/org/farm-access",
    ])
      expect(isCacheableData(p), p).toBe(false);
    for (const p of ["/org/farms", "/org/farms/f1", "/org/records", "/org/tasks", "/org/members", "/org/farms/f1/climate", "/me", "/me/onboarding"])
      expect(isCacheableData(p), p).toBe(true);
  });
  it("PMTiles de otro origen son del mapa; fuentes de Google, de las fuentes; lo demás de otro origen no", () => {
    expect(classify({ method: "GET", url: TILES, mode: "cors" }, ORIGIN, pre)).toBe("tiles");
    expect(classify({ method: "GET", url: "https://fonts.gstatic.com/s/inter.woff2", mode: "cors" }, ORIGIN, pre)).toBe("fonts");
    expect(classify({ method: "GET", url: "https://evil.example/x.js", mode: "cors" }, ORIGIN, pre)).toBeNull();
    expect(classify({ method: "GET", url: "https://wa.me/1", mode: "navigate" }, ORIGIN, pre)).toBeNull();
  });
  it("las consultas de ERP y administración no se persisten", () => {
    expect(isPersistableQueryKey(["erp", "stock"])).toBe(false);
    expect(isPersistableQueryKey(["admin-metrics"])).toBe(false);
    expect(isPersistableQueryKey(["farm", "f1"])).toBe(true);
    expect(isPersistableQueryKey([])).toBe(false);
  });
});

describe("run_worker_first de wrangler", () => {
  it("el service worker conoce las mismas rutas que el Worker", () => {
    const wrangler = readFileSync(join(__dirname, "../../../api/wrangler.jsonc"), "utf8");
    const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(wrangler)![1]!;
    const globs = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(globs.length).toBeGreaterThan(5);
    for (const g of globs) {
      const path = g.replace("/*", "/algo");
      expect(isWorkerFirst(path), path).toBe(true);
    }
    // y al revés: nada de lo que listamos sobra
    for (const p of WORKER_FIRST) {
      const asGlob = p.endsWith("/") ? `${p}*` : p;
      expect(globs.includes(asGlob) || globs.includes(`${p}/*`), p).toBe(true);
    }
  });
});

describe("cáscara", () => {
  it("instala todo lo de la build y falla si falta algo crítico", async () => {
    const w = world();
    await w.h.install();
    const shell = w.caches.stores.get(SHELL_PREFIX + "abc123")!;
    expect([...shell.entries.keys()].sort()).toEqual(manifest.urls.map((u) => ORIGIN + u).sort());

    const bad = world();
    bad.respond = (r) => (new URL(r.url).pathname === "/assets/index-1.js" ? new Response("x", { status: 404 }) : new Response("ok"));
    await expect(bad.h.install()).rejects.toThrow(/precache/);
  });
  it("un archivo no crítico que falla no impide instalar", async () => {
    const w = world();
    w.respond = (r) => (new URL(r.url).pathname === "/icon-192.png" ? new Response("x", { status: 500 }) : new Response("ok"));
    await expect(w.h.install()).resolves.toBeUndefined();
  });
  it("sin conexión, las navegaciones y los assets salen de la caché", async () => {
    const w = world();
    w.respond = (r) => new Response(`net:${new URL(r.url).pathname}`);
    await w.h.install();
    w.online = false;
    expect(await (await w.call(`${ORIGIN}/estancias/f1/parte`, { mode: "navigate" })).text()).toBe("net:/");
    expect(await (await w.call(`${ORIGIN}/assets/index-1.js`)).text()).toBe("net:/assets/index-1.js");
  });
  it("un asset que no estaba precacheado se guarda al usarlo", async () => {
    const w = world();
    await w.h.install();
    await w.call(`${ORIGIN}/assets/lazy-9.js`);
    w.online = false;
    expect(await (await w.call(`${ORIGIN}/assets/lazy-9.js`)).text()).toBe("net:/assets/lazy-9.js");
  });
  it("al activar se borran las cáscaras de otras versiones (y la de U-17), no las de datos ni mapas", async () => {
    const w = world();
    for (const n of ["yvy-shell-v1", "yvy-shell-old", DATA_CACHE, TILE_FILES_CACHE, TILE_RANGES_CACHE, "otra"]) await w.caches.open(n);
    await w.h.install();
    await w.h.activate();
    expect(await w.caches.keys()).toEqual(expect.arrayContaining([SHELL_PREFIX + "abc123", DATA_CACHE, TILE_FILES_CACHE, TILE_RANGES_CACHE, "otra"]));
    expect(await w.caches.keys()).not.toContain("yvy-shell-v1");
    expect(await w.caches.keys()).not.toContain("yvy-shell-old");
  });
});

describe("lecturas GET /org y /me", () => {
  it("red primero y deja una copia con la fecha", async () => {
    const w = world();
    w.respond = () => Response.json([{ id: "f1" }]);
    const res = await w.call(`${ORIGIN}/org/farms`, { headers: { authorization: "Bearer x" } });
    expect(res.headers.get(FROM_CACHE_HEADER)).toBeNull();
    const copy = await w.caches.stores.get(DATA_CACHE)!.match(`${ORIGIN}/org/farms`);
    expect(copy?.headers.get(SAVED_AT_HEADER)).toBe("1700000000000");
    expect(await copy?.json()).toEqual([{ id: "f1" }]);
  });
  it("sin red responde la copia y lo marca", async () => {
    const w = world();
    w.respond = () => Response.json({ farm: "a" });
    await w.call(`${ORIGIN}/org/farms/f1`);
    w.online = false;
    const res = await w.call(`${ORIGIN}/org/farms/f1`);
    expect(res.status).toBe(200);
    expect(res.headers.get(FROM_CACHE_HEADER)).toBe("1700000000000");
    expect(await res.json()).toEqual({ farm: "a" });
  });
  it("sin red y sin copia, falla como siempre", async () => {
    const w = world();
    w.online = false;
    await expect(w.call(`${ORIGIN}/org/tasks`)).rejects.toThrow(/Failed to fetch/);
  });
  it("un 401 o un 500 del servidor NO se reemplaza por la copia", async () => {
    const w = world();
    w.respond = () => Response.json({ ok: 1 });
    await w.call(`${ORIGIN}/org/farms`);
    w.respond = () => new Response("{}", { status: 401 });
    expect((await w.call(`${ORIGIN}/org/farms`)).status).toBe(401);
    w.respond = () => new Response("{}", { status: 500 });
    expect((await w.call(`${ORIGIN}/org/farms`)).status).toBe(500);
    // y la copia buena sigue ahí
    const copy = await w.caches.stores.get(DATA_CACHE)!.match(`${ORIGIN}/org/farms`);
    expect(await copy?.json()).toEqual({ ok: 1 });
  });
  it("cada consulta (con sus filtros) tiene su propia copia", async () => {
    const w = world();
    w.respond = (r) => Response.json({ q: new URL(r.url).search });
    await w.call(`${ORIGIN}/org/records?farmId=a`);
    await w.call(`${ORIGIN}/org/records?farmId=b`);
    w.online = false;
    expect(await (await w.call(`${ORIGIN}/org/records?farmId=a`)).json()).toEqual({ q: "?farmId=a" });
    expect(await (await w.call(`${ORIGIN}/org/records?farmId=b`)).json()).toEqual({ q: "?farmId=b" });
  });
  it("no guarda respuestas con cookies", async () => {
    const w = world();
    w.respond = () => new Response("{}", { headers: { "set-cookie": "a=b" } });
    await w.call(`${ORIGIN}/org/farms`);
    expect(w.caches.stores.get(DATA_CACHE)?.entries.size ?? 0).toBe(0);
  });
  it("cerrar sesión borra copias y mapas", async () => {
    const w = world();
    w.respond = () => Response.json({});
    await w.call(`${ORIGIN}/org/farms`);
    await w.caches.open(TILE_FILES_CACHE);
    await w.h.clearData();
    expect(await w.caches.keys()).toEqual([]);
  });
});

// ---- PMTiles de mentira: 2 teselas, para ver pasar los pedidos por rango ----
const te = new TextEncoder();
function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 128) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
export function tinyPmtiles(tiles: string[]): Uint8Array<ArrayBuffer> {
  const data = tiles.map((t) => te.encode(t));
  // directorio raíz sin comprimir: n, deltas de tileId, runLength, length, offset+1 (0 = contiguo)
  const dir = [
    ...varint(tiles.length),
    ...tiles.map((_, i) => (i === 0 ? 0 : 1)).flatMap((d) => varint(d)),
    ...tiles.flatMap(() => varint(1)),
    ...data.flatMap((d) => varint(d.length)),
    ...data.flatMap((_, i) => varint(i === 0 ? 1 : 0)),
  ];
  const dirOffset = 127;
  const tileOffset = dirOffset + dir.length;
  const total = tileOffset + data.reduce((a, d) => a + d.length, 0);
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf.set(te.encode("PMTiles"), 0);
  dv.setUint8(7, 3);
  const u64 = (o: number, v: number) => {
    dv.setUint32(o, v >>> 0, true);
    dv.setUint32(o + 4, Math.floor(v / 2 ** 32), true);
  };
  u64(8, dirOffset);
  u64(16, dir.length);
  u64(24, tileOffset); // metadata vacía
  u64(32, 0);
  u64(40, tileOffset); // sin hojas
  u64(48, 0);
  u64(56, tileOffset);
  u64(64, total - tileOffset);
  u64(72, tiles.length);
  u64(80, tiles.length);
  u64(88, tiles.length);
  dv.setUint8(96, 1);
  dv.setUint8(97, 1); // directorios sin comprimir
  dv.setUint8(98, 1); // teselas sin comprimir
  dv.setUint8(99, 3); // jpeg
  dv.setUint8(100, 0);
  dv.setUint8(101, 1);
  buf.set(dir, dirOffset);
  let at = tileOffset;
  for (const d of data) {
    buf.set(d, at);
    at += d.length;
  }
  return buf;
}

describe("mapa: PMTiles por rango", () => {
  const archive = tinyPmtiles(["TESELA-RAIZ", "TESELA-UNO"]);
  const serve = (r: Request): Response => {
    const m = /^bytes=(\d+)-(\d+)$/.exec(r.headers.get("range") ?? "")!;
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), archive.length - 1);
    return new Response(archive.slice(start, end + 1), {
      status: 206,
      headers: { "content-range": `bytes ${start}-${end}/${archive.length}`, "content-length": String(end - start + 1), etag: '"v1"' },
    });
  };
  const useWorld = (w: World) => {
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const p = w.h.handle(new Request(url, init), (x) => w.waits.push(x));
      return p ?? Promise.reject(new Error("sin handler"));
    });
  };
  const text = async (p: PMTiles, z: number, x: number, y: number) => {
    const t = await p.getZxy(z, x, y);
    return t ? new TextDecoder().decode(t.data) : null;
  };
  afterEach(() => vi.unstubAllGlobals());

  it("el archivo de prueba es un PMTiles válido", async () => {
    const w = world();
    w.respond = serve;
    useWorld(w);
    const p = new PMTiles(TILES);
    expect(await text(p, 0, 0, 0)).toBe("TESELA-RAIZ");
    expect(await text(p, 1, 0, 0)).toBe("TESELA-UNO");
  });

  it("con conexión guarda los rangos vistos; sin conexión responde solo esos", async () => {
    const w = world();
    w.respond = serve;
    useWorld(w);
    await text(new PMTiles(TILES), 0, 0, 0); // se mira una tesela con conexión
    await Promise.all(w.waits);
    expect(w.caches.stores.get(TILE_RANGES_CACHE)!.entries.size).toBeGreaterThanOrEqual(2); // cabecera y tesela
    // la caché guarda 200 (la Cache API no admite 206) con el rango original aparte
    const first = [...w.caches.stores.get(TILE_RANGES_CACHE)!.entries.values()][0]!;
    expect(first.status).toBe(200);

    w.online = false;
    expect(await text(new PMTiles(TILES), 0, 0, 0)).toBe("TESELA-RAIZ"); // instancia nueva: sin caché en memoria
    await expect(text(new PMTiles(TILES), 1, 0, 0)).rejects.toThrow(); // la que nunca se vio, no está
  });

  it("con el archivo entero guardado responde cualquier rango sin red", async () => {
    const w = world();
    w.online = false;
    useWorld(w);
    await (await w.caches.open(TILE_FILES_CACHE)).put(TILES, new Response(archive, { headers: { etag: '"v1"', "content-type": "application/octet-stream" } }));
    const p = new PMTiles(TILES);
    expect(await text(p, 0, 0, 0)).toBe("TESELA-RAIZ");
    expect(await text(p, 1, 0, 0)).toBe("TESELA-UNO");
    expect(w.fetched).toEqual([]); // nunca tocó la red
  });

  it("el archivo entero guardado gana aunque haya red; un rango pedido de más se recorta", async () => {
    const w = world();
    let hits = 0;
    w.respond = (r) => {
      hits++;
      return serve(r);
    };
    await (await w.caches.open(TILE_FILES_CACHE)).put(TILES, new Response(archive));
    const res = await w.call(TILES, { headers: { range: "bytes=0-99999" }, mode: "cors" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-${archive.length - 1}/${archive.length}`);
    expect(hits).toBe(0);
  });

  it("topa la caché de rangos y descarta los más viejos", async () => {
    const { PieceCache } = await import("./tileCache");
    const caches = new FakeCacheStorage();
    const pc = new PieceCache(() => caches.open("r"), 1000);
    const piece = (n: number) =>
      new Response(new Uint8Array(n), { status: 206, headers: { "content-range": `bytes 0-${n - 1}/9999`, "content-length": String(n) } });
    for (let i = 0; i < 10; i++) await pc.put(`https://k.test/${i}`, piece(300), 1);
    const keys = [...caches.stores.get("r")!.entries.keys()];
    expect(keys.length).toBeLessThanOrEqual(3); // 900 bytes es el tope de 90 %
    expect(keys).toContain("https://k.test/9");
    expect(keys).not.toContain("https://k.test/0");
    expect(await pc.bytes()).toBeLessThanOrEqual(1000);
    expect(await pc.get("https://k.test/0")).toBeNull();
    const back = await pc.get("https://k.test/9");
    expect(back?.status).toBe(206);
    expect(back?.headers.get("content-range")).toBe("bytes 0-299/9999");
  });

  it("un rango más grande que el tope no se guarda", async () => {
    const { PieceCache } = await import("./tileCache");
    const caches = new FakeCacheStorage();
    const pc = new PieceCache(() => caches.open("r"), 100);
    await pc.put("https://k.test/big", new Response(new Uint8Array(500), { status: 206, headers: { "content-range": "bytes 0-499/999" } }), 1);
    expect(caches.stores.get("r")?.entries.size ?? 0).toBe(0);
  });
});
