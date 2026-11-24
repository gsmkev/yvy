import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  newChecklist,
  parseChecklist,
  resetChecklist,
  serializeChecklist,
  setChecklistItem,
} from "../src";

describe("lista de verificación", () => {
  it("arma ítems con ids por posición y descarta líneas vacías", () => {
    const l = newChecklist(["Bebedero 1", "  ", "Bebedero 2 "]);
    expect(l).toEqual([
      { id: "i1", text: "Bebedero 1", done: false },
      { id: "i2", text: "Bebedero 2", done: false },
    ]);
    expect(serializeChecklist([])).toBeNull();
  });
  it("tilda por ítem, avisa si no existe y cuenta el avance", () => {
    const l = newChecklist(["a", "b", "c"]);
    const t = setChecklistItem(l, "i2", true)!;
    expect(checklistProgress(t)).toEqual({ done: 1, total: 3 });
    expect(setChecklistItem(l, "nope", true)).toBeNull();
    expect(checklistProgress(resetChecklist(t)).done).toBe(0);
  });
  it("un JSON roto no tira la pantalla", () => {
    expect(parseChecklist("{no")).toEqual([]);
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist(JSON.stringify([{ id: "i1", text: "x", done: false }]))).toHaveLength(1);
  });
});
