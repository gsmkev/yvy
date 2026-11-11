import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

describe("T-07 · última anotación por lote en el detalle de la estancia", () => {
  it("trae lastRecordAt por lote (la más reciente) y null si nunca se anotó", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    const rec = (plotId: string, capturedAt: number) => ({
      mutationId: newId(),
      kind: "records.upsert",
      row: {
        id: newId(),
        farmId,
        plotId,
        poiId: null,
        kind: "rain",
        data: { mm: 10, readAt: 1 },
        schemaVersion: RECORD_SCHEMA_VERSION,
        lon: null,
        lat: null,
        gpsAccuracyM: null,
        capturedAt,
      },
    });
    const recent = Date.now() - 86_400_000;
    const old = Date.now() - 30 * 86_400_000;
    const push = await call("POST", "/sync/push", {
      token: worker.token,
      body: { deviceId: "d", mutations: [rec(plotIds[0]!, old), rec(plotIds[0]!, recent), rec(plotIds[1]!, old)] },
    });
    expect(push.status).toBe(200);

    const res = await call<{ plots: { id: string; lastRecordAt: number | null }[] }>("GET", `/org/farms/${farmId}`, {
      token: owner.token,
    });
    const at = (id: string) => res.body.plots.find((p) => p.id === id)!.lastRecordAt;
    expect(at(plotIds[0]!)).toBe(recent);
    expect(at(plotIds[1]!)).toBe(old);
    expect(at(plotIds[2]!)).toBeNull();
  });
});
