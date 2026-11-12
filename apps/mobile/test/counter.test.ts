import { describe, expect, it } from "vitest";
import { MAX_HEAD_PER_CATEGORY, parseRecordData } from "@yvy/shared";
import { allZero, bump, canContinue, counterTotal, seedCounts, setTyped } from "../src/lib/counter";

describe("contador rápido de hacienda", () => {
  it("suma y resta sin bajar de cero", () => {
    let c = bump({}, "vaca", 1);
    c = bump(c, "vaca", 1);
    c = bump(c, "vaca", 5);
    expect(c.vaca).toBe(7);
    expect(bump(c, "vaca", -100).vaca).toBe(0);
    expect(bump({}, "toro", -1).toro).toBe(0);
  });

  it("no pasa del tope por categoría", () => {
    expect(bump({ vaca: MAX_HEAD_PER_CATEGORY }, "vaca", 1).vaca).toBe(MAX_HEAD_PER_CATEGORY);
    expect(setTyped({}, "vaca", "9999999").vaca).toBe(MAX_HEAD_PER_CATEGORY);
  });

  it("el texto tipeado se limpia y vacío es cero", () => {
    expect(setTyped({}, "novillo", "1a2,5").novillo).toBe(125);
    expect(setTyped({ novillo: 4 }, "novillo", "").novillo).toBe(0);
  });

  it("hace falta tocar al menos una categoría; un cero tocado cuenta", () => {
    expect(canContinue({})).toBe(false);
    expect(canContinue(bump({}, "ternero", -1))).toBe(true);
    expect(canContinue(allZero())).toBe(true);
  });

  it("el total suma todas las categorías", () => {
    expect(counterTotal({ vaca: 10, toro: 2, ternero: 4 })).toBe(16);
  });

  it("parte del stock calculado y lo que arma el contador valida con el esquema compartido", () => {
    const seeded = seedCounts({ vaca: 20, toro: 1 });
    expect(seeded).toEqual({ vaca: 20, vaquilla: 0, novillo: 0, ternero: 0, toro: 1 });
    expect(seedCounts(null)).toEqual({});
    const c = bump(seeded, "vaca", -3);
    expect(parseRecordData("herd_count", { counts: c }).success).toBe(true);
  });
});
