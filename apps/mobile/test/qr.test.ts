/** Pruebas de QR. */
import { describe, expect, it } from "vitest";
import { qrMatrix, qrPath } from "../src/ui/qrMatrix";

describe("QR", () => {
  const link = "yvy://link?c=" + "a".repeat(32);
  it("genera una matriz cuadrada para un enlace típico", () => {
    const m = qrMatrix(link);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((r) => r.length === m.length)).toBe(true);
    // buscador superior izquierdo: esquina oscura
    expect(m[0]![0]).toBe(true);
    expect(m[0]![6]).toBe(true);
    expect(m[1]![1]).toBe(false);
  });
  it("el trazo tiene margen de 4 módulos", () => {
    const m = qrMatrix(link);
    const p = qrPath(m);
    expect(p.size).toBe(m.length + 8);
    expect(p.d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});
