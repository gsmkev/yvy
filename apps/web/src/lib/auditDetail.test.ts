/** Pruebas de auditSummary; auditLabel. */
import { describe, expect, it } from "vitest";
import { auditLabel, auditSummary } from "./auditDetail";

const UUID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("auditSummary", () => {
  it("oculta IDs y UUID, traduce claves conocidas y deja la clave desconocida en minúsculas", () => {
    const detail = JSON.stringify({
      values: { farmId: UUID, title: "Lote 3", crop: "maiz", plotCount: 4, assigneeId: UUID },
      fields: ["geometry"],
    });
    expect(auditSummary(detail)).toBe("Título: Lote 3 · Cultivo: maiz · plot count: 4 · cambió: geometry");
  });

  it("muestra los campos sueltos que no están dentro de values", () => {
    expect(auditSummary(JSON.stringify({ id: UUID, name: "Juan", role: "admin", id2: UUID }))).toBe(
      "Nombre: Juan · Rol: admin",
    );
  });

  it("formatea las fechas en epoch ms con el helper de fechas", () => {
    const ms = Date.parse("2026-11-09T23:53:00Z");
    expect(auditSummary(JSON.stringify({ createdAt: ms }))).toBe("Creado: 9 nov, 20:53");
  });

  it("no muestra UUID sueltos ni objetos anidados, y no corta el texto", () => {
    const long = "x".repeat(300);
    const out = auditSummary(JSON.stringify({ notes: long, nested: { a: 1 }, ref: UUID }));
    expect(out).toBe(`Notas: ${long}`);
  });

  it("devuelve vacío si el detalle no es JSON", () => {
    expect(auditSummary("no es json")).toBe("");
    expect(auditSummary("")).toBe("");
  });
});

describe("auditLabel", () => {
  it("separa camelCase y pasa a minúsculas las claves desconocidas", () => {
    expect(auditLabel("supplyKgPerDay")).toBe("supply kg per day");
    expect(auditLabel("title")).toBe("Título");
  });
});
