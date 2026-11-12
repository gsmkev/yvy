import { describe, expect, it } from "vitest";
import { FERT_LAYERS, FERT_LAYER_KEYS, FERT_LAYER_PARAM, FERT_STYLE, fertilityPointCounts } from "../src";

const s = (lon: number | null, lat: number | null, over: Record<string, number | null> = {}) => ({ lon, lat, ph: 5, pMgKg: null, kCmolKg: null, omPct: null, ...over });

describe("A-31 mapas de fertilidad", () => {
  it("cuenta ubicaciones distintas con coordenadas y valor", () => {
    const c = fertilityPointCounts([s(-55.1, -27.1), s(-55.1, -27.1), s(-55.2, -27.1, { pMgKg: 8 }), s(null, null), s(-55.3, -27.1, { ph: null })]);
    expect(c).toEqual({ fert_ph: 2, fert_p: 1, fert_k: 0, fert_om: 0 });
  });
  it("las capas, parámetros y estilos van de la mano", () => {
    expect([...FERT_LAYER_KEYS]).toEqual([...FERT_LAYERS]);
    for (const k of FERT_LAYER_KEYS) {
      expect(FERT_LAYER_PARAM[k]).toBeTruthy();
      expect(FERT_STYLE[k].hi).toBeGreaterThan(FERT_STYLE[k].lo);
    }
  });
});
