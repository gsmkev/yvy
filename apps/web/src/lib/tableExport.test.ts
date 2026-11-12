import { describe, expect, it } from "vitest";
import { toCsv } from "./tableExport";

describe("toCsv", () => {
  it("escapa comillas y comas, y neutraliza fórmulas", () => {
    const csv = toCsv({
      name: "x",
      headers: ["A", "B"],
      rows: [
        ['dice "hola", chau', 1.5],
        ["=SUMA(A1)", null],
      ],
    });
    expect(csv).toBe('A,B\r\n"dice ""hola"", chau",1.5\r\n\'=SUMA(A1),');
  });
});
