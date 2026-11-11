import { beforeEach, describe, expect, it } from "vitest";
import { deleteFilter, loadSavedFilters, saveFilter } from "./savedFilters";

const f = { farmId: "", authorId: "", kind: "pest", from: "2026-11-01", to: "" };

describe("savedFilters", () => {
  beforeEach(() => localStorage.clear());

  it("guarda, reemplaza por nombre y borra", () => {
    saveFilter("Plagas de la semana", f);
    saveFilter("plagas de la semana", { ...f, kind: "rain" });
    expect(loadSavedFilters()).toHaveLength(1);
    expect(loadSavedFilters()[0]!.filters.kind).toBe("rain");
    const id = loadSavedFilters()[0]!.id;
    expect(deleteFilter(id)).toEqual([]);
  });
  it("ignora nombres vacíos y datos corruptos", () => {
    expect(saveFilter("  ", f)).toEqual([]);
    localStorage.setItem("yvy.savedFilters.anon", "{no json");
    expect(loadSavedFilters()).toEqual([]);
  });
});
