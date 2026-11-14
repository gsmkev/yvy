import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { pwaPlugin } from "./scripts/pwa-plugin.ts";

const API = ["/auth", "/sync", "/org", "/media", "/admin", "/me", "/devices", "/health", "/descargar-app", "/public"];

/** Versión de la app para el `buster` de la copia de lecturas (ADR 0005): cada despliegue descarta la copia vieja. */
const APP_VERSION = process.env.GITHUB_SHA?.slice(0, 8) ?? Date.now().toString(36);

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react(), tailwindcss(), pwaPlugin()],
  build: { outDir: "../api/public", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { proxy: Object.fromEntries(API.map((p) => [p, process.env.API_URL ?? "http://localhost:8787"])) },
  test: { environment: "jsdom", exclude: ["e2e/**", "node_modules/**"] },
} as never);
