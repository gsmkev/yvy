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
