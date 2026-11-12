import { describe, expect, it } from "vitest";
import {
  compareThresholds,
  hasKey,
  MONITOR_CROPS,
  MONITOR_TEMPLATES,
  monitorTemplate,
  stationAverages,
  summarizeStations,
} from "../src";

describe("plantillas de monitoreo", () => {
  it("soja y maíz con las plagas pedidas y unidades válidas", () => {
    expect(MONITOR_TEMPLATES.soja.map((i) => i.key)).toEqual([
      "chinche_verde",
      "chinche_vaina",
      "chinche_marron",
      "oruga_bolillera",
      "oruga_medidora",
      "roya",
    ]);
    expect(MONITOR_TEMPLATES.maiz.map((i) => i.key)).toEqual(["cogollero", "chicharrita"]);
    expect(monitorTemplate("trigo")).toBeNull();
    expect(monitorTemplate(null)).toBeNull();
  });
  it("todas las claves tienen texto en es-PY", () => {
    for (const crop of MONITOR_CROPS) {
      expect(hasKey(`app.monitorCrop_${crop}`)).toBe(true);
      for (const i of MONITOR_TEMPLATES[crop]) {
        expect(hasKey(`app.monitor_${i.key}`)).toBe(true);
        expect(hasKey(`app.monitorUnit_${i.unit}`)).toBe(true);
      }
    }
  });
});

describe("estaciones", () => {
  const tpl = MONITOR_TEMPLATES.soja;
  it("promedia contando 0 lo que no se anotó", () => {
    const avg = stationAverages([{ counts: { chinche_verde: 4 } }, { counts: { chinche_verde: 1, roya: 10 } }], tpl);
    expect(avg.chinche_verde).toBe(2.5);
    expect(avg.roya).toBe(5);
    expect(avg.oruga_medidora).toBe(0);
    expect(stationAverages([], tpl)).toEqual({});
  });
  it("compara con el umbral: igual no pasa, mayor sí", () => {
    const r = compareThresholds({ chinche_verde: 2, chinche_vaina: 2.01 }, tpl);
    expect(r.find((x) => x.key === "chinche_verde")!.over).toBe(false);
    expect(r.find((x) => x.key === "chinche_vaina")!.over).toBe(true);
    expect(r).toHaveLength(2);
  });
  it("resumen: la plaga más cerca del umbral da el nombre y la intensidad", () => {
    const s = summarizeStations([{ counts: { chinche_verde: 1, oruga_medidora: 30 } }], tpl);
    expect(s.pest).toBe("oruga");
    expect(s.intensity).toBe("high");
    expect(s.perMeter).toBe(30);
    const roya = summarizeStations([{ counts: { roya: 1 } }], tpl);
    expect(roya.pest).toBe("roya");
    expect(roya.perMeter).toBeUndefined();
    expect(roya.intensity).toBe("low");
  });
});
