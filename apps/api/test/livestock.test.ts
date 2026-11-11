/** Ganadería (ADR 0004): registros de hacienda, stock calculado y permisos. */
import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

export const rec = (
  farmId: string,
  plotId: string | null,
  kind: string,
  data: unknown,
  capturedAt = Date.now() - 1000,
) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId,
    poiId: null,
    kind,
    data,
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: null,
    lat: null,
    gpsAccuracyM: null,
    capturedAt,
  },
});

export const push = (token: string, mutations: unknown[]) =>
  call("POST", "/sync/push", { token, body: { deviceId: "dev", mutations } });

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 4);
  const worker = await addMemberAndLogin(owner.token, "worker");
  await call("PUT", `/org/members/${worker.userId}/plots`, {
    token: owner.token,
    body: { plotIds: plotIds.slice(0, 2) },
  });
  return { owner, worker, farmId, plotIds };
}

describe("registro herd_count", () => {
  it("se guarda con potrero y cabezas por categoría", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [rec(farmId, plotIds[0]!, "herd_count", { counts: { vaca: 80, toro: 3 } })]);
    expect(r.body.results[0].status).toBe("applied");
  });

  it("rechaza sin potrero, vacío, negativos y categorías desconocidas", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [
      rec(farmId, null, "herd_count", { counts: { vaca: 1 } }),
      rec(farmId, plotIds[0]!, "herd_count", { counts: {} }),
      rec(farmId, plotIds[0]!, "herd_count", { counts: { vaca: -2 } }),
      rec(farmId, plotIds[0]!, "herd_count", { counts: { oveja: 2 } }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    expect(r.body.results.every((x: any) => x.reason === "invalid")).toBe(true);
  });

  it("el empleado cuenta solo en sus potreros asignados", async () => {
    const { worker, farmId, plotIds } = await setup();
    const r = await push(worker.token, [
      rec(farmId, plotIds[0]!, "herd_count", { counts: { vaca: 10 } }),
      rec(farmId, plotIds[3]!, "herd_count", { counts: { vaca: 10 } }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
    expect(r.body.results[1].reason).toBe("forbidden");
  });
});

describe("registro herd_move", () => {
  const counts = { vaca: 10 };

  it("rotación entre potreros de la estancia", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[1], counts, reason: "rotacion" }),
      // venta: sale del campo, sin destino
      rec(farmId, plotIds[0]!, "herd_move", { counts, reason: "venta" }),
      // compra: entra de afuera, sin origen
      rec(farmId, null, "herd_move", { toPlotId: plotIds[1], counts, reason: "compra" }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied", "applied"]);
  });

  it("rechaza destino faltante, venta con destino, mismo potrero y sin origen ni destino", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [
      rec(farmId, plotIds[0]!, "herd_move", { counts, reason: "rotacion" }),
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[1], counts, reason: "venta" }),
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[0], counts, reason: "rotacion" }),
      rec(farmId, null, "herd_move", { counts, reason: "otro" }),
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[1], counts: {}, reason: "rotacion" }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(Array(5).fill("rejected"));
  });

  it("el destino tiene que ser de la misma estancia y no puede ser ajeno", async () => {
    const { owner, farmId, plotIds } = await setup();
    const other = await createOrgWithOwner("Otra");
    const foreign = await createFarmWithPlots(other.token, 1);
    const r = await push(owner.token, [
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: foreign.plotIds[0], counts, reason: "rotacion" }),
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: newId(), counts, reason: "rotacion" }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["rejected", "rejected"]);
    expect(r.body.results[0].reason).toBe("forbidden");
  });

  it("el empleado mueve solo entre sus potreros asignados", async () => {
    const { worker, farmId, plotIds } = await setup();
    const r = await push(worker.token, [
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[1], counts, reason: "rotacion" }),
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[3], counts, reason: "rotacion" }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
    expect(r.body.results[1].reason).toBe("forbidden");
  });
});

describe("registro mortality", () => {
  const ok = { category: "ternero", head: 2, cause: "enfermedad" };

  it("se guarda con potrero, categoría, cabezas y causa", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [rec(farmId, plotIds[0]!, "mortality", ok)]);
    expect(r.body.results[0].status).toBe("applied");
  });

  it("rechaza sin potrero, cero cabezas, decimales, causa o categoría desconocida", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [
      rec(farmId, null, "mortality", ok),
      rec(farmId, plotIds[0]!, "mortality", { ...ok, head: 0 }),
      rec(farmId, plotIds[0]!, "mortality", { ...ok, head: 1.5 }),
      rec(farmId, plotIds[0]!, "mortality", { ...ok, cause: "brujeria" }),
      rec(farmId, plotIds[0]!, "mortality", { ...ok, category: "oveja" }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(Array(5).fill("rejected"));
  });

  it("el empleado carga mortandad solo en sus potreros", async () => {
    const { worker, farmId, plotIds } = await setup();
    const r = await push(worker.token, [
      rec(farmId, plotIds[1]!, "mortality", ok),
      rec(farmId, plotIds[2]!, "mortality", ok),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
  });
});

describe("registro health", () => {
  const ok = { reason: "aftosa", product: "Aftosa bivalente", dose: "2 ml", counts: { vaca: 50, ternero: 20 } };

  it("se guarda con y sin potrero (la manga puede ser de varios)", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [rec(farmId, plotIds[0]!, "health", ok), rec(farmId, null, "health", ok)]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied"]);
  });

  it("rechaza producto vacío, motivo desconocido y cabezas vacías o negativas", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await push(owner.token, [
      rec(farmId, plotIds[0]!, "health", { ...ok, product: "  " }),
      rec(farmId, plotIds[0]!, "health", { ...ok, reason: "magia" }),
      rec(farmId, plotIds[0]!, "health", { ...ok, counts: {} }),
      rec(farmId, plotIds[0]!, "health", { ...ok, counts: { vaca: -1 } }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(Array(4).fill("rejected"));
  });

  it("el empleado no trata en un potrero ajeno", async () => {
    const { worker, farmId, plotIds } = await setup();
    const r = await push(worker.token, [rec(farmId, plotIds[0]!, "health", ok), rec(farmId, plotIds[3]!, "health", ok)]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
  });
});
