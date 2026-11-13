import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });

describe("exportar tablas (U-28)", () => {
  const sources = files(root).map((p) => ({ p: p.slice(root.length + 1), s: readFileSync(p, "utf8") }));

  it("ninguna pantalla pone a la vez ExportableTable y su propio menú de exportar (saldría duplicado)", () => {
    const both = sources.filter(({ p, s }) => p !== "components/ExportableTable.tsx" && /<ExportableTable\b/.test(s) && /<(TableExportMenu|ExportMenu)\b/.test(s));
    expect(both.map((x) => x.p)).toEqual([]);
  });

  it("no quedan botones de texto sueltos \"Exportar Excel\" / \"Exportar CSV\" en los componentes", () => {
    const loose = sources.filter(({ s }) => /ui\.exportCsv|Exportar CSV/.test(s));
    expect(loose.map((x) => x.p)).toEqual([]);
  });

  it("cada ExportableTable lleva un nombre de archivo", () => {
    for (const { p, s } of sources) for (const m of s.matchAll(/<ExportableTable\b([^>]*)>/g)) expect([p, /\bname=/.test(m[1]!)]).toEqual([p, true]);
  });
});
