// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootAssets, buildPrecache } from "../../scripts/pwa-plugin";

const root = join(__dirname, "../..");

describe("manifiesto", () => {
  const m = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
  it("es instalable: nombre, inicio, modo y colores de marca", () => {
    expect(m.name).toMatch(/^Yvy/);
    expect(m.short_name).toBe("Yvy");
    expect(m.lang).toBe("es-PY");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toMatch(/^\//);
    expect(m.scope).toBe("/");
    expect(m.id).toBe("/");
    expect(m.theme_color).toBe("#F1EEE4"); // lino
    expect(m.background_color).toBe("#F1EEE4");
  });
  it("trae los íconos que pide Chrome (192, 512 y maskable)", () => {
    const has = (sizes: string, purpose?: string) =>
      m.icons.some((i: { sizes: string; purpose?: string }) => i.sizes === sizes && (purpose ? i.purpose === purpose : i.purpose !== "maskable"));
    expect(has("192x192")).toBe(true);
    expect(has("512x512")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
    for (const i of m.icons) {
      const file = join(root, "public", i.src);
      expect(() => readFileSync(file), i.src).not.toThrow();
    }
  });
});

describe("precache de la build", () => {
  const out = mkdtempSync(join(tmpdir(), "yvy-pwa-"));
  mkdirSync(join(out, "assets"));
  mkdirSync(join(out, "landing"));
  mkdirSync(join(out, "maplibre"));
  writeFileSync(
    join(out, "index.html"),
    '<link rel="icon" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/assets/index-A.js"></script><link rel="stylesheet" href="/assets/index-A.css"><link href="https://fonts.googleapis.com/css2?x" rel="stylesheet">',
  );
  for (const [f, c] of Object.entries({
    "assets/index-A.js": "js",
    "assets/index-A.css": "css",
    "assets/lazy-B.js": "lazy",
    "assets/lazy-B.js.map": "map",
    "manifest.webmanifest": "{}",
    "favicon.svg": "<svg/>",
    "maplibre/worker.mjs": "w",
    "landing/foto.webp": "img",
    "sw.js": "viejo",
    ".gitkeep": "",
  }))
    writeFileSync(join(out, f), c);

  it("lista todo menos el service worker, los mapas de fuente y la landing", () => {
    const p = buildPrecache(out);
    expect(p.urls).toEqual([
      "/assets/index-A.css",
      "/assets/index-A.js",
      "/assets/lazy-B.js",
      "/favicon.svg",
      "/",
      "/manifest.webmanifest",
      "/maplibre/worker.mjs",
    ]);
  });
  it("lo crítico es el index.html, el manifiesto y lo que carga al arrancar", () => {
    const p = buildPrecache(out);
    expect(p.critical).toEqual(["/", "/manifest.webmanifest", "/favicon.svg", "/assets/index-A.js", "/assets/index-A.css"]);
    expect(p.critical.every((u) => p.urls.includes(u))).toBe(true);
  });
  it("la versión cambia si cambia cualquier archivo y se mantiene si no", () => {
    const a = buildPrecache(out).version;
    expect(buildPrecache(out).version).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    writeFileSync(join(out, "assets/lazy-B.js"), "lazy2");
    expect(buildPrecache(out).version).not.toBe(a);
  });
  it("bootAssets ignora otros orígenes", () => {
    expect(bootAssets('<script src="/a.js"></script><link href="https://x.y/z.css"><link href="//cdn/z.css">')).toEqual(["/a.js"]);
  });
});
