import { describe, expect, it } from "vitest";
import { localDate, newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

interface MemberRow {
  userId: string;
  activeDays7: number;
  records7d: number;
  lastSyncAt: number | null;
}

describe("T-06 · actividad por miembro en /org/members", () => {
  it("cuenta días activos, registros de 7 días y última sincronización por miembro", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const worker = await addMemberAndLogin(owner.token, "worker");
    const idle = await addMemberAndLogin(owner.token, "worker", "Sin actividad");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });

    const day = (n: number) => localDate(Date.now() - n * 86_400_000);
    // 2 días dentro de la ventana (hoy y hace 3) y 1 fuera (hace 9)
    await db()
      .insert(s.activityDaily)
      .values(
        [0, 3, 9].map((n) => ({ userId: worker.userId, organizationId: owner.orgId, day: day(n), role: "worker" })),
      )
      .onConflictDoNothing();
    const syncAt = Date.now() - 3_600_000;
    await db()
      .insert(s.devices)
      .values({ id: newId(), userId: worker.userId, platform: "android", lastSyncAt: syncAt });

    const rec = (capturedAt: number) => ({
      mutationId: newId(),
      kind: "records.upsert",
      row: {
        id: newId(),
        farmId,
        plotId: plotIds[0],
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
    const push = await call("POST", "/sync/push", {
      token: worker.token,
      body: {
        deviceId: "d1",
        mutations: [rec(Date.now()), rec(Date.now() - 86_400_000), rec(Date.now() - 20 * 86_400_000)],
      },
    });
    expect(push.status).toBe(200);

    const res = await call<MemberRow[]>("GET", "/org/members", { token: owner.token });
    expect(res.status).toBe(200);
    const w = res.body.find((m) => m.userId === worker.userId)!;
    expect(w.records7d).toBe(2);
    expect(w.activeDays7).toBeGreaterThanOrEqual(2);
    expect(w.activeDays7).toBeLessThanOrEqual(3);
    expect(w.lastSyncAt).toBeGreaterThanOrEqual(syncAt);
    const i = res.body.find((m) => m.userId === idle.userId)!;
    expect(i).toMatchObject({ activeDays7: 0, records7d: 0, lastSyncAt: null });
  });

  it("no mezcla actividad de otra organización", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    await db()
      .insert(s.activityDaily)
      .values({ userId: b.userId, organizationId: b.orgId, day: localDate(Date.now()), role: "owner" })
      .onConflictDoNothing();
    const res = await call<MemberRow[]>("GET", "/org/members", { token: a.token });
    expect(res.body.every((m) => m.userId !== b.userId)).toBe(true);
    expect(res.body.find((m) => m.userId === a.userId)!.records7d).toBe(0);
  });
});
