/** Recorrida GPS (F-05): el registro `track` se valida, se guarda y vuelve en el pull. */
import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

const track = (farmId: string, plotId: string | null, data: Record<string, unknown>) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId,
    poiId: null,
    kind: "track",
    data,
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: -55.89,
    lat: -27.21,
    gpsAccuracyM: null,
    capturedAt: Date.now(),
  },
});

const good = {
  line: [
    [-55.89, -27.21],
    [-55.889, -27.209],
    [-55.888, -27.209],
  ],
  distanceM: 320,
  durationS: 400,
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_400_000,
};

const push = (token: string, mutations: unknown[]) => call("POST", "/sync/push", { token, body: { deviceId: "dev", mutations } });

describe("track", () => {
  it("empleado en su lote guarda la recorrida y vuelve en el pull", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    const m = track(farmId, plotIds[0]!, good);
    const r = await push(worker.token, [m]);
    expect(r.body.results[0].status).toBe("applied");
    const pulled = await pullAll(worker.token, "records");
    const rec = pulled.find((x: any) => x.id === m.row.id);
    expect(rec.kind).toBe("track");
    expect(JSON.parse(rec.data).distanceM).toBe(320);
  });

  it("rechaza una línea con una sola posición, coordenadas fuera de rango o tiempos al revés", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const r = await push(owner.token, [
      track(farmId, null, { ...good, line: [[-55.89, -27.21]] }),
      track(farmId, null, { ...good, line: [[-55.89, -27.21], [-55.88, 95]] }),
      track(farmId, null, { ...good, startedAt: 10, endedAt: 5 }),
      track(farmId, null, { ...good, line: Array.from({ length: 501 }, (_, i) => [-55.89 + i * 1e-5, -27.21]) }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    expect(r.body.results[0].reason).toBe("invalid");
  });
});
