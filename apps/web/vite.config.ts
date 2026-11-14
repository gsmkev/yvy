import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { pwaPlugin } from "./scripts/pwa-plugin.ts";

const API = ["/auth", "/sync", "/org", "/media", "/admin", "/me", "/devices", "/health", "/descargar-app", "/public"];

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaPlugin()],
  build: { outDir: "../api/public", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { proxy: Object.fromEntries(API.map((p) => [p, process.env.API_URL ?? "http://localhost:8787"])) },
  test: { environment: "jsdom", exclude: ["e2e/**", "node_modules/**"] },
} as never);
