import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = ["/auth", "/sync", "/org", "/media", "/me", "/devices", "/health"];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "../api/public", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { proxy: Object.fromEntries(API.map((p) => [p, "http://localhost:8787"])) },
  test: { environment: "jsdom", exclude: ["e2e/**", "node_modules/**"] },
} as never);
