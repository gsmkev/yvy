import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, PEST_THRESHOLDS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runJob } from "../src/jobs";
import { evaluatePests } from "../src/jobs/pests";
import { call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const today = "2026-12-10";
const plots = [
  { id: "p1", name: "Lote 1", crop: "soja" },
  { id: "p2", name: "Lote 2", crop: "maiz" },
];

describe("umbral de plagas (regla pura)", () => {
  it("la chinche sobre 2 por metro en soja avisa; en el umbral o debajo no", () => {
    expect(PEST_THRESHOLDS.chinche!.perMeter).toBe(2);
    const hit = evaluatePests([{ plotId: "p1", pest: "chinche", avgPerMeter: 2.5, n: 3 }], plots, new Map(), today);
    expect(hit).toMatchObject({ kind: "pest_threshold", severity: "watch" });
    expect((hit!.details as { plotIds: string[] }).plotIds).toEqual(["p1"]);
    expect(evaluatePests([{ plotId: "p1", pest: "chinche", avgPerMeter: 2, n: 3 }], plots, new Map(), today)).toBeNull();
    expect(evaluatePests([{ plotId: "p1", pest: "chinche", avgPerMeter: 4.5, n: 3 }], plots, new Map(), today)).toMatchObject({
      severity: "warning",
    });
  });

  it("ignora cultivos que no corresponden y plagas sin umbral", () => {
    expect(evaluatePests([{ plotId: "p2", pest: "chinche", avgPerMeter: 9, n: 2 }], plots, new Map(), today)).toBeNull();
    expect(evaluatePests([{ plotId: "p1", pest: "roya", avgPerMeter: 99, n: 2 }], plots, new Map(), today)).toBeNull();
  });

  it("la chinche solo cuenta en floración y llenado si el estado es conocido", () => {
    const row = [{ plotId: "p1", pest: "chinche", avgPerMeter: 3, n: 2 }];
    expect(evaluatePests(row, plots, new Map([["p1", "vegetativo"]]), today)).toBeNull();
    expect(evaluatePests(row, plots, new Map([["p1", "llenado"]]), today)).not.toBeNull();
  });
});

describe("job de plagas", () => {
  async function pestRecord(
    orgId: string,
    userId: string,
    farmId: string,
    plotId: string,
    perMeter: number,
    capturedAt: number,
    kind: "pest" | "crop_status" = "pest",
    data: object = { pest: "chinche", perMeter },
  ) {
    await db()
      .insert(s.records)
      .values({
        id: newId(),
        organizationId: orgId,
        farmId,
        plotId,
        authorId: userId,
        kind,
        data: JSON.stringify(data),
        schemaVersion: 1,
        capturedAt,
        createdAt: capturedAt,
        updatedAt: capturedAt,
        version: 1,
      });
  }
  const deps = (now: number) => ({ fetch: (() => Promise.reject(new Error("sin red"))) as typeof fetch, now: () => now });

  it("crea el aviso con el lote, una sola vez, y no cuenta registros viejos", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const now = Date.now();
    const day = 86_400_000;
    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[0]!, 3, now - day);
    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[0]!, 2.5, now - 2 * day);
    // lote 2: promedio bajo y un registro viejo muy alto que queda fuera de la ventana
    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[1]!, 1, now - day);
    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[1]!, 20, now - 10 * day);

    await runJob({ type: "pest", farmId }, env, deps(now));
    await runJob({ type: "pest", farmId }, env, deps(now));
    const alerts = (await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId))).filter(
      (a) => a.kind === "pest_threshold",
    );
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0]!.plotIds)).toEqual([plotIds[0]]);
    expect(alerts[0]!.summary).toContain("Chinche");
    const list = await call<any[]>("GET", "/org/alerts?active=1", { token: owner.token });
    expect(list.body.map((a) => a.kind)).toContain("pest_threshold");
  });

  it("sin superar el umbral no hay aviso; un estado vegetativo lo descarta", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const now = Date.now();
    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[0]!, 1.5, now - 3_600_000);
    await runJob({ type: "pest", farmId }, env, deps(now));
    expect(await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId))).toHaveLength(0);

    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[0]!, 5, now - 3_600_000);
    await pestRecord(owner.orgId, owner.userId, farmId, plotIds[0]!, 0, now - 1_000, "crop_status", {
      stage: "vegetativo",
      condition: "good",
    });
    await runJob({ type: "pest", farmId }, env, deps(now));
    expect(await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId))).toHaveLength(0);
  });
});
