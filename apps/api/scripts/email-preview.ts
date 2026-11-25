/**
 * Vista previa de los correos: escribe un HTML por plantilla (con datos de ejemplo) y un `index.html` que los junta.
 * Uso: `pnpm --filter api exec tsx scripts/email-preview.ts [carpeta]` (por defecto `./email-preview`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emailSamples } from "../src/lib/email";

const out = process.argv[2] ?? "email-preview";
mkdirSync(out, { recursive: true });
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

const samples = emailSamples("https://yvy.example");
const files = samples.map((m, i) => {
  const name = `${String(i + 1).padStart(2, "0")}.html`;
  writeFileSync(join(out, name), m.html);
  return { name, subject: m.subject };
});

const frame = (f: { name: string; subject: string }) =>
  ["<h2 style=\"font-size:14px;margin:24px 0 6px\">", esc(f.subject), "</h2><iframe src=\"", f.name, "\" style=\"width:640px;height:760px;border:1px solid #ccc;background:#fff\" title=\"", esc(f.subject), "\"></iframe>"].join("");
const index = [
  "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Correos de Yvy</title>",
  "<body style=\"font-family:sans-serif;margin:24px;background:#f4f4f0\"><h1>Correos de Yvy</h1>",
  ...files.map(frame),
  "</body></html>",
].join("\n");
writeFileSync(join(out, "index.html"), index);
console.log(`${files.length} correos en ${out}`);
