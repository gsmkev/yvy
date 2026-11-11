import { describe, expect, it } from "vitest";
import { newId, parseRecordData } from "@yvy/shared";
import { FLOWS, visibleSteps } from "../src/lib/annotate";
import { LocalDb } from "../src/db/store";
import { nodeSql } from "./node-sql";

const ORG = newId();

const setup = () => {
  const db = new LocalDb(nodeSql(), () => Date.now());
  db.migrate();
  return db;
};

const season = (over: Record<string, unknown> = {}) => ({
  id: newId(),
  organizationId: ORG,
  name: "Zafra 2026/27",
  startDate: "2026-09-01",
  endDate: null,
  active: 1,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  version: 1,
  ...over,
});

describe("campañas en el celular", () => {
  it("bajan con el pull y solo se ofrecen las activas", async () => {
    const db = setup();
    const a = season();
    await db.applyPull(
      "seasons",
      [a, season({ name: "Zafra 2025/26", active: 0 }), season({ name: "Borrada", deletedAt: 5 })],
      { version: 1, id: a.id },
    );
    expect(db.activeSeasons().map((x) => x.name)).toEqual(["Zafra 2026/27"]);
  });

  it("plot_seasons: lo planificado del lote en la campaña", async () => {
    const db = setup();
    const s1 = season();
    const plotId = newId();
    await db.applyPull(
      "plot_seasons",
      [
        {
          id: newId(),
          organizationId: ORG,
          plotId,
          seasonId: s1.id,
          crop: "soja",
          variety: "DM 6563",
          plannedSowingDate: "2026-10-20",
          targetYieldTHa: 3.5,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          version: 2,
        },
      ],
      null,
    );
    expect(db.plotSeason(plotId, s1.id)).toMatchObject({ crop: "soja", variety: "DM 6563", targetYieldTHa: 3.5 });
    expect(db.plotSeason(plotId, newId())).toBeNull();
  });
});

describe("flujo de siembra", () => {
  const ctx = { askSeason: true };
  const keys = (v: Record<string, unknown>, askSeason = true) =>
    visibleSteps(FLOWS.sowing, v, { askSeason }).map((x) => x.key);

  it("pregunta la campaña solo si hay más de una activa", () => {
    expect(keys({})).toContain("seasonId");
    expect(keys({}, false)).not.toContain("seasonId");
  });

  it("la densidad aparece después de elegir su unidad", () => {
    expect(keys({})).not.toContain("density");
    expect(keys({ densityUnit: "seeds_m" })).toContain("density");
    expect(keys({ densityUnit: undefined })).not.toContain("density");
    expect(visibleSteps(FLOWS.rain, {}, ctx)).toHaveLength(1);
  });

  it("los datos que arma el flujo pasan el esquema compartido", () => {
    expect(
      parseRecordData("sowing", { seasonId: newId(), crop: "maiz", densityUnit: "kg_ha", density: 20, areaHa: 12.5 }).success,
    ).toBe(true);
    expect(parseRecordData("sowing", { crop: "maiz", densityUnit: "kg_ha" }).success).toBe(true);
  });
});

describe("flujo de aplicación", () => {
  it("productos primero, condiciones opcionales después", () => {
    const steps = visibleSteps(FLOWS.application, {}, { askSeason: false });
    expect(steps.map((x) => x.key)).toEqual(["products", "volumeLHa", "areaHa", "windKmh", "tempC", "humidityPct", "note"]);
    expect(steps.filter((x) => x.kind === "number").every((x) => x.kind === "number" && x.optional)).toBe(true);
  });

  it("el catálogo baja al celular y los datos calculan Delta T", async () => {
    const db = setup();
    const id = newId();
    await db.applyPull(
      "products",
      [
        {
          id,
          organizationId: ORG,
          name: "Glifosato 48",
          type: "agrochemical",
          unit: "l",
          activeIngredient: "glifosato",
          withdrawalDays: 15,
          toxClass: null,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          version: 1,
        },
      ],
      null,
    );
    expect(db.products().map((p) => p.name)).toEqual(["Glifosato 48"]);
    const r = parseRecordData("application", {
      products: [{ productId: id, name: "Glifosato 48", dose: 2, unit: "l_ha" }],
      tempC: 25,
      humidityPct: 50,
    });
    expect(r.success && (r.data as { deltaT?: number }).deltaT).toBeGreaterThan(5);
  });
});

describe("flujo de fertilización", () => {
  it("productos en kg/ha, método y superficie", () => {
    const steps = visibleSteps(FLOWS.fertilization, {}, { askSeason: false });
    expect(steps.map((x) => x.key)).toEqual(["products", "method", "areaHa", "note"]);
    expect(steps[0]).toMatchObject({ fixedUnit: "kg_ha" });
  });
});
