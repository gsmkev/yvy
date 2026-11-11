/** Ganadería (ADR 0004): registros de hacienda, stock calculado y permisos. */
import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

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

describe("stock calculado y carga animal", () => {
  const T0 = Date.now() - 10 * 86_400_000;
  const day = (n: number) => T0 + n * 86_400_000;

  async function pastures() {
    const ctx = await setup();
    for (const id of ctx.plotIds)
      await call("PATCH", `/org/plots/${id}`, { token: ctx.owner.token, body: { kind: "pasture" } });
    return ctx;
  }
  const stockOf = (token: string, farmId: string) => call<any>("GET", `/org/farms/${farmId}/stock`, { token });

  it("conteos + movimientos + mortandad dan la hacienda actual", async () => {
    const { owner, farmId, plotIds } = await pastures();
    const [A, B] = [plotIds[0]!, plotIds[1]!];
    const r = await push(owner.token, [
      rec(farmId, A, "herd_count", { counts: { vaca: 50, toro: 2 } }, day(0)),
      rec(farmId, B, "herd_count", { counts: { vaca: 10 } }, day(0)),
      rec(farmId, A, "herd_move", { toPlotId: B, counts: { vaca: 20 }, reason: "rotacion" }, day(1)),
      rec(farmId, A, "mortality", { category: "vaca", head: 1, cause: "enfermedad" }, day(2)),
      rec(farmId, B, "mortality", { category: "vaca", head: 2, cause: "rayo" }, day(2)),
      // venta posterior: sale del campo
      rec(farmId, B, "herd_move", { counts: { vaca: 6 }, reason: "venta" }, day(3)),
    ]);
    expect(r.body.results.every((x: any) => x.status === "applied")).toBe(true);
    const res = await stockOf(owner.token, farmId);
    expect(res.status).toBe(200);
    const a = res.body.plots.find((p: any) => p.plotId === A);
    const b = res.body.plots.find((p: any) => p.plotId === B);
    expect(a.counts).toMatchObject({ vaca: 29, toro: 2 });
    expect(b.counts.vaca).toBe(22);
    expect(res.body.farm.counts.vaca).toBe(51);
    expect(res.body.farm.total).toBe(53);
    expect(a.lastCountAt).toBe(day(0));
    expect(a.uaPerHa).toBeCloseTo(a.ua / a.areaHa);
  });

  it("un conteo nuevo corrige lo acumulado", async () => {
    const { owner, farmId, plotIds } = await pastures();
    const A = plotIds[0]!;
    await push(owner.token, [
      rec(farmId, A, "herd_count", { counts: { vaca: 50 } }, day(0)),
      rec(farmId, A, "mortality", { category: "vaca", head: 5, cause: "otra" }, day(1)),
      rec(farmId, A, "herd_count", { counts: { vaca: 47 } }, day(2)),
    ]);
    const res = await stockOf(owner.token, farmId);
    expect(res.body.plots.find((p: any) => p.plotId === A).counts.vaca).toBe(47);
  });

  it("ignora registros borrados y marca sobrecarga contra el límite configurable", async () => {
    const { owner, farmId, plotIds } = await pastures();
    const A = plotIds[0]!;
    const del = rec(farmId, A, "herd_count", { counts: { vaca: 9999 } }, day(1));
    await push(owner.token, [rec(farmId, A, "herd_count", { counts: { vaca: 400 } }, day(0)), del]);
    await push(owner.token, [
      { mutationId: newId(), kind: "records.delete", row: { id: (del.row as { id: string }).id } },
    ]);
    let res = await stockOf(owner.token, farmId);
    const a = () => res.body.plots.find((p: any) => p.plotId === A);
    expect(a().counts.vaca).toBe(400);
    // 400 UA sobre ~100 ha: por encima del límite por defecto (1 UA/ha)
    expect(res.body.maxUaIsDefault).toBe(true);
    expect(a().overLimit).toBe(true);
    const put = await call("PUT", `/org/farms/${farmId}/livestock-settings`, {
      token: owner.token,
      body: { maxUaPerHa: 10 },
    });
    expect(put.status).toBe(200);
    res = await stockOf(owner.token, farmId);
    expect(res.body.maxUaPerHa).toBe(10);
    expect(res.body.maxUaIsDefault).toBe(false);
    expect(a().overLimit).toBe(false);
  });

  it("permisos: el empleado no ve el stock ni cambia el límite; el agrónomo ve pero no cambia", async () => {
    const { owner, worker, farmId } = await pastures();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const admin = await addMemberAndLogin(owner.token, "admin");
    expect((await stockOf(worker.token, farmId)).status).toBe(403);
    expect((await stockOf(agro.token, farmId)).status).toBe(200);
    const put = (token: string, body: unknown) =>
      call("PUT", `/org/farms/${farmId}/livestock-settings`, { token, body });
    expect((await put(worker.token, { maxUaPerHa: 2 })).status).toBe(403);
    expect((await put(agro.token, { maxUaPerHa: 2 })).status).toBe(403);
    expect((await put(admin.token, { maxUaPerHa: 2 })).status).toBe(200);
    expect((await put(owner.token, { maxUaPerHa: 0 })).status).toBe(400);
  });

  it("no mezcla organizaciones", async () => {
    const { farmId } = await pastures();
    const other = await createOrgWithOwner("Otra");
    expect((await stockOf(other.token, farmId)).status).toBe(404);
  });
});

describe("pull de hacienda al celular", () => {
  it("los conteos viejos y un año de movimientos bajan aunque pasen los 30 días del historial", async () => {
    const { worker, farmId, plotIds } = await setup();
    const old = Date.now() - 90 * 86_400_000;
    const r = await push(worker.token, [
      rec(farmId, plotIds[0]!, "herd_count", { counts: { vaca: 10 } }, old),
      rec(farmId, plotIds[0]!, "herd_move", { toPlotId: plotIds[1], counts: { vaca: 1 }, reason: "rotacion" }, old),
      rec(farmId, plotIds[0]!, "mortality", { category: "vaca", head: 1, cause: "rayo" }, old),
      rec(farmId, plotIds[0]!, "rain" as never, { mm: 5, readAt: 1 }, old),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied", "applied", "applied"]);
    const kinds = (await pullAll(worker.token, "records")).map((x: any) => x.kind).sort();
    expect(kinds).toEqual(["herd_count", "herd_move", "mortality"]);
  });
});
