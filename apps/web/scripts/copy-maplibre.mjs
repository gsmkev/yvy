// MapLibre 6 carga su worker como módulo ES aparte; Vite no lo empaqueta, así que se sirve desde /maplibre/.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const dist = join(dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist");
mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(dist, f), join("public/maplibre", f));
