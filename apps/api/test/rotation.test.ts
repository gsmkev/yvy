/** G-04 rotación de potreros y G-05 oferta de forraje. */
import { describe, expect, it } from "vitest";
import {
  estimateForage,
  FORAGE,
  kgDmFromHeight,
  kgDmFromNdvi,
  newId,
  paddockTimelines,
  type PaddockTimeline,
  rotationPlan,
  ROTATION_DEFAULTS,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createOrgWithOwner, db } from "./helpers";
import { DAY, setupHerd } from "./herd-helpers";
import { push, rec } from "./records-helpers";

const NOW = 1_000 * DAY;

describe("paddockTimelines (puro)", () => {
  it("ocupación, salida y descanso desde conteos y movimientos", () => {
    const tl = paddockTimelines(
      ["A", "B", "C"],
      [
        { at: NOW - 60 * DAY, type: "count", plotId: "A", counts: { vaca: 50 } },
        { at: NOW - 40 * DAY, type: "move", fromPlotId: "A", toPlotId: "B", counts: { vaca: 50 } },
        { at: NOW - 10 * DAY, type: "move", fromPlotId: "B", toPlotId: "A", counts: { vaca: 30 } },
      ],
      NOW,
    );
    // A: ocupado 20 días, vacío 30, ocupado de nuevo hace 10
    expect(tl.get("A")).toMatchObject({ occupied: true, head: 30, stayDays: 10, restDays: null, occupiedDays: 30 });
    expect(tl.get("B")).toMatchObject({ occupied: true, head: 20, stayDays: 40 });
    expect(tl.get("C")).toMatchObject({ occupied: false, restDays: null, stayDays: null, occupiedDays: 0 });
    const left = paddockTimelines(["A"], [
      { at: NOW - 30 * DAY, type: "count", plotId: "A", counts: { vaca: 10 } },
      { at: NOW - 12 * DAY, type: "move", fromPlotId: "A", toPlotId: null, counts: { vaca: 10 } },
    ], NOW).get("A")!;
    expect(left).toMatchObject({ occupied: false, stayDays: 18, restDays: 12, occupiedDays: 18, head: 0 });
  });
  it("la mortandad que vacía el potrero cuenta como salida y un conteo en cero también", () => {
    const tl = paddockTimelines(["A", "B"], [
      { at: NOW - 20 * DAY, type: "count", plotId: "A", counts: { toro: 1 } },
      { at: NOW - 5 * DAY, type: "loss", plotId: "A", category: "toro", head: 1 },
      { at: NOW - 20 * DAY, type: "count", plotId: "B", counts: { vaca: 4 } },
      { at: NOW - 2 * DAY, type: "count", plotId: "B", counts: { vaca: 0 } },
    ], NOW);
    expect(tl.get("A")).toMatchObject({ occupied: false, restDays: 5 });
    expect(tl.get("B")).toMatchObject({ occupied: false, restDays: 2 });
  });
});

describe("rotationPlan (puro)", () => {
  const plots = ["A", "B", "C", "D"].map((id) => ({ plotId: id, name: id, areaHa: 10 }));
  const empty = (id: string, rest: number | null): PaddockTimeline => ({
    plotId: id, occupied: false, head: 0, occupiedSince: null, emptySince: rest === null ? null : NOW - rest * DAY,
    stayDays: rest === null ? null : 5, restDays: rest, occupiedDays: 5,
  });
  it("sugiere el potrero descansado con pasto listo; el de pasto bajo no se sugiere", () => {
    const tl = new Map([
      ["A", { ...empty("A", 0), occupied: true, head: 20, occupiedSince: NOW - 3 * DAY, stayDays: 3, restDays: null }],
      ["B", empty("B", 20)], // descanso corto
      ["C", empty("C", 60)], // descansado pero pasto bajo
      ["D", empty("D", 40)],
    ]);
    const pastures = new Map([
      ["C", { heightCm: 8, cover: "low" as const, at: NOW - DAY }],
      ["D", { heightCm: 30, cover: "high" as const, at: NOW - DAY }],
    ]);
    const r = rotationPlan(plots, tl, pastures, NOW);
    expect(r.plots.map((p) => p.state)).toEqual(["occupied", "resting", "ready", "ready"]);
    expect(r.suggested).toMatchObject({ plotId: "D", pastureReady: true });
  });
  it("marca la ocupación pasada de los días máximos y sin candidatos no sugiere", () => {
    const tl = new Map([
      ["A", { ...empty("A", 0), occupied: true, head: 5, stayDays: ROTATION_DEFAULTS.maxOccupancyDays + 1, restDays: null }],
      ["B", empty("B", 10)],
    ]);
    const r = rotationPlan(plots.slice(0, 2), tl, new Map(), NOW);
    expect(r.plots[0]!.state).toBe("overdue");
    expect(r.suggested).toBeNull();
  });
  it("entre los listos prefiere pasto medido, después sin medir, y por más descanso", () => {
    const tl = new Map([["A", empty("A", 50)], ["B", empty("B", 90)], ["C", empty("C", 70)], ["D", empty("D", null)]]);
    const pastures = new Map([["A", { heightCm: 25, cover: "medium" as const, at: NOW - DAY }]]);
    const r = rotationPlan(plots, tl, pastures, NOW);
    expect(r.suggested?.plotId).toBe("A");
    // una medición vieja (más de 45 días) no cuenta
    const old = new Map([["A", { heightCm: 25, cover: "medium" as const, at: NOW - 100 * DAY }]]);
    expect(rotationPlan(plots, tl, old, NOW).suggested?.plotId).toBe("B");
    expect(r.plots[3]!.state).toBe("unknown");
  });
});

describe("estimateForage (puro)", () => {
  it("altura × coeficiente de cobertura y NDVI, con ponderación y aprovechamiento", () => {
    expect(kgDmFromHeight(20, "medium")).toBe(2400);
    expect(kgDmFromNdvi(0.7)).toBe(4000);
    expect(kgDmFromNdvi(0.1)).toBe(0);
    const base = { cover: null, heightAt: null, ndviAt: null, areaHa: 10, ua: 0, now: NOW, heightCm: null, ndvi: null };
    const both = estimateForage({ ...base, heightCm: 20, cover: "medium", heightAt: NOW, ndvi: 0.7, ndviAt: NOW, ua: 50 });
    expect(both).toMatchObject({ method: "both", kgDmHa: Math.round(0.6 * 2400 + 0.4 * 4000), demandKgDay: 500 });
    expect(both.totalKgDm).toBe(both.kgDmHa! * 10);
    expect(both.usableKgDm).toBe(Math.round(both.totalKgDm! * FORAGE.utilization));
    expect(both.daysLeft).toBe(Math.floor(both.usableKgDm! / 500));
    // calibrada: la altura (2.400) manda y el NDVI de hoy (4.000) contra el de la medición (3.200) la sube un 25 %
    expect(estimateForage({ ...base, heightCm: 20, cover: "medium", heightAt: NOW, ndvi: 0.7, ndviAt: NOW, ndviAtHeight: 0.6 })).toMatchObject({ method: "calibrated", kgDmHa: 3000 });
    // la razón se acota: una imagen mala no dispara el número
    expect(estimateForage({ ...base, heightCm: 20, cover: "medium", heightAt: NOW, ndvi: 0.9, ndviAt: NOW, ndviAtHeight: 0.21 }).kgDmHa).toBe(Math.round(2400 * FORAGE.ratioMax));
    expect(estimateForage({ ...base, ndvi: 0.7, ndviAt: NOW })).toMatchObject({ method: "ndvi", kgDmHa: 4000, daysLeft: null });
    expect(estimateForage(base)).toMatchObject({ method: null, kgDmHa: null, usableKgDm: null, stale: false });
    expect(estimateForage({ ...base, heightCm: 10, cover: "low", heightAt: NOW - 40 * DAY }).stale).toBe(true);
  });
});

describe("GET /org/farms/:id/rotation", () => {
  it("reconstruye ocupación y descanso y sugiere el próximo potrero", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const [A, B, C] = [plotIds[0]!, plotIds[1]!, plotIds[2]!];
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, A, "herd_count", { counts: { vaca: 40 } }, now - 70 * DAY),
      rec(farmId, A, "herd_move", { toPlotId: B, counts: { vaca: 40 }, reason: "rotacion" }, now - 50 * DAY),
      rec(farmId, B, "herd_move", { toPlotId: C, counts: { vaca: 40 }, reason: "rotacion" }, now - 5 * DAY),
      rec(farmId, A, "pasture_status", { heightCm: 28, cover: "high", livestockPresent: false }, now - 3 * DAY),
      rec(farmId, B, "pasture_status", { heightCm: 12, cover: "low", livestockPresent: false }, now - 3 * DAY),
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/rotation`, { token: owner.token });
    expect(res.status).toBe(200);
    const by = (id: string) => res.body.plots.find((p: any) => p.plotId === id);
    expect(by(A)).toMatchObject({ occupied: false, state: "ready", pastureReady: true });
    expect(Math.round(by(A).restDays)).toBe(50);
    expect(Math.round(by(A).occupiedDays)).toBe(20);
    expect(by(B)).toMatchObject({ state: "resting", pastureReady: false });
    expect(by(C)).toMatchObject({ occupied: true, head: 40 });
    expect(Math.round(by(C).stayDays)).toBe(5);
    expect(res.body.suggested).toMatchObject({ plotId: A });
    expect(res.body.defaults.minRestDays).toBe(35);
  });

  it("permisos: el empleado no, el agrónomo sí, otra organización no", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/rotation`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/rotation`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/rotation`, { token: other.token })).status).toBe(404);
  });
});

describe("GET /org/farms/:id/forage", () => {
  it("combina altura medida, NDVI del satélite y hacienda para dar días de pasto", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const A = plotIds[0]!;
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, A, "herd_count", { counts: { vaca: 50 } }, now - 5 * DAY),
      rec(farmId, A, "pasture_status", { heightCm: 20, cover: "medium", livestockPresent: true }, now - 2 * DAY),
    ]);
    const ts = Date.now();
    await db().insert(s.plotIndexStats).values({
      id: newId(), organizationId: owner.orgId, plotId: A, sceneId: newId(), acquiredAt: now - 4 * DAY, idx: "ndvi",
      mean: 0.7, p10: 0.6, p90: 0.8, validPct: 100, createdAt: ts, updatedAt: ts, version: 1,
    });
    const res = await call<any>("GET", `/org/farms/${farmId}/forage`, { token: owner.token });
    expect(res.status).toBe(200);
    const a = res.body.plots.find((p: any) => p.plotId === A);
    // la imagen es de la misma semana que la altura: la altura fija el nivel (2.400 kg MS/ha) y el NDVI no lo mueve
    expect(a).toMatchObject({ method: "calibrated", heightCm: 20, cover: "medium", ndvi: 0.7, head: 50, stale: false });
    expect(a.kgDmHa).toBe(2400);
    expect(a.demandKgDay).toBe(500);
    expect(a.daysLeft).toBeGreaterThan(0);
    const b = res.body.plots.find((p: any) => p.plotId === plotIds[1]);
    expect(b).toMatchObject({ method: null, kgDmHa: null, daysLeft: null });
    expect(res.body.coefficients.utilization).toBe(0.5);
  });

  it("una imagen posterior a la altura mueve la estimación; sin imagen cercana se pondera", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const [A, B] = [plotIds[0]!, plotIds[1]!];
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, A, "pasture_status", { heightCm: 20, cover: "medium", livestockPresent: false }, now - 20 * DAY),
      rec(farmId, B, "pasture_status", { heightCm: 20, cover: "medium", livestockPresent: false }, now - 20 * DAY),
    ]);
    const ts = Date.now();
    const ndvi = (plotId: string, at: number, mean: number) => ({
      id: newId(), organizationId: owner.orgId, plotId, sceneId: newId(), acquiredAt: at, idx: "ndvi" as const,
      mean, p10: mean - 0.1, p90: mean + 0.1, validPct: 100, createdAt: ts, updatedAt: ts, version: 1,
    });
    await db().insert(s.plotIndexStats).values([
      ndvi(A, now - 21 * DAY, 0.6), // 3.200 kg/ha el día de la medición
      ndvi(A, now - 2 * DAY, 0.4), // 1.600 kg/ha hoy: la mitad
      ndvi(B, now - 2 * DAY, 0.7), // B no tiene imagen de la fecha de la medición
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/forage`, { token: owner.token });
    const a = res.body.plots.find((p: any) => p.plotId === A);
    expect(a).toMatchObject({ method: "calibrated", kgDmHa: 1200 }); // 2.400 x 0,5
    const b = res.body.plots.find((p: any) => p.plotId === B);
    expect(b).toMatchObject({ method: "both", kgDmHa: Math.round(0.6 * 2400 + 0.4 * 4000) });
  });

  it("permisos: el empleado no; no mezcla organizaciones", async () => {
    const { worker, farmId } = await setupHerd();
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/forage`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/forage`, { token: other.token })).status).toBe(404);
  });
});
