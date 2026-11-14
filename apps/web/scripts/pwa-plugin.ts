/**
 * Plugin de Vite de la PWA (ADR 0005). Al terminar el build:
 *  1. lista todos los archivos de la salida (salvo los que no hacen falta sin conexión) con su hash,
 *  2. calcula la versión de la build a partir de esos hashes,
 *  3. compila src/sw/index.ts a /sw.js con esa lista incrustada (`__PRECACHE__`).
 * Sin vite-plugin-pwa ni Workbox: el service worker queda en TypeScript, con tests, y el despliegue en el Worker
 * (assets estáticos con `run_worker_first` para la API) no cambia.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { build, type Plugin, type ResolvedConfig } from "vite";

export interface Precache {
  version: string;
  urls: string[];
  critical: string[];
}

/** Lo que no se precachea: el propio sw.js, mapas de fuente, marcadores y las imágenes de la landing pública. */
const SKIP = [/^sw\.js$/, /\.map$/, /^\.gitkeep$/, /^landing\//, /^campo-itapua\.webp$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Rutas ("/assets/x.js") que carga el index.html al arrancar: sin ellas la app no abre. */
export const bootAssets = (html: string): string[] =>
  [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]!).filter((p) => !p.startsWith("//"));

export function buildPrecache(outDir: string): Precache {
  const files = walk(outDir)
    .map((f) => relative(outDir, f).split(sep).join("/"))
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .sort();
  const hash = createHash("sha256");
  const urls: string[] = [];
  for (const f of files) {
    hash.update(f).update(readFileSync(join(outDir, f)));
    urls.push(f === "index.html" ? "/" : `/${f}`);
  }
  const html = readFileSync(join(outDir, "index.html"), "utf8");
  const boot = bootAssets(html).filter((u) => urls.includes(u));
  const critical = ["/", "/manifest.webmanifest", ...boot].filter((u, i, a) => urls.includes(u) && a.indexOf(u) === i);
  return { version: hash.digest("hex").slice(0, 12), urls, critical };
}

export function pwaPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "yvy-pwa",
    apply: "build",
    configResolved(c) {
      config = c;
    },
    async closeBundle() {
      const out = resolve(config.root, config.build.outDir);
      const manifest = buildPrecache(out);
      await build({
        configFile: false,
        root: config.root,
        logLevel: "warn",
        publicDir: false,
        define: { __PRECACHE__: JSON.stringify(manifest) },
        build: {
          outDir: out,
          emptyOutDir: false,
          minify: true,
          target: "es2022",
          copyPublicDir: false,
          lib: { entry: resolve(config.root, "src/sw/index.ts"), formats: ["iife"], name: "YvySw", fileName: () => "sw.js" },
        },
      });
      config.logger.info(`PWA: ${manifest.urls.length} archivos precacheados, versión ${manifest.version}`);
    },
  };
}
