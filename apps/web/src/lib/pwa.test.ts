import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const swSource = readFileSync(join(root, "public/sw.js"), "utf8");

/** Carga sw.js con un `self` falso y devuelve su manejador de fetch. */
function loadFetchHandler() {
  let handler: ((e: unknown) => void) | undefined;
  const self = {
    location: { origin: "https://yvy.test" },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (type === "fetch") handler = fn;
    },
  };
  new Function("self", "caches", "fetch", "URL", swSource)(self, { open: () => Promise.reject(new Error("sin cache")) }, () => {}, URL);
  return handler!;
}

const intercepted = (handler: (e: unknown) => void, path: string, mode = "cors", method = "GET") => {
  let called = false;
  handler({
    request: { method, url: `https://yvy.test${path}`, mode },
    respondWith: (p: Promise<unknown>) => {
      p.catch(() => {});
      called = true;
    },
  });
  return called;
};

describe("service worker", () => {
  const handler = loadFetchHandler();

  it("no toca ninguna ruta de run_worker_first (salvo las lecturas de estancias)", () => {
    const wrangler = readFileSync(join(root, "../api/wrangler.jsonc"), "utf8");
    const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(wrangler)![1]!;
    const globs = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(globs.length).toBeGreaterThan(5);
    for (const g of globs) {
      const path = g.replace("/*", "/algo");
      expect(intercepted(handler, path, "navigate"), path).toBe(false);
      expect(intercepted(handler, path), path).toBe(false);
    }
    expect(intercepted(handler, "/org/tasks")).toBe(false);
    expect(intercepted(handler, "/org/farms/abc/problem-areas")).toBe(false);
  });
  it("solo guarda GET /org/farms y /org/farms/:id", () => {
    expect(intercepted(handler, "/org/farms")).toBe(true);
    expect(intercepted(handler, "/org/farms/abc")).toBe(true);
    expect(intercepted(handler, "/org/farms/abc", "cors", "POST")).toBe(false);
  });
  it("maneja las navegaciones de la app y los archivos con hash", () => {
    expect(intercepted(handler, "/estancias/abc", "navigate")).toBe(true);
    expect(intercepted(handler, "/assets/index-abc123.js")).toBe(true);
    expect(intercepted(handler, "/favicon.svg")).toBe(false);
  });
  it("el manifiesto tiene nombre, colores e íconos", () => {
    const m = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
    expect(m.name).toBe("Yvy");
    expect(m.theme_color).toBe("#FBFAF5");
    expect(m.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
    expect(m.icons.some((i: { sizes: string }) => i.sizes === "192x192")).toBe(true);
  });
});
