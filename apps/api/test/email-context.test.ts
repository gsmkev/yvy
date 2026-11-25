import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { loadAlertContexts } from "../src/jobs/alert-context";
import { loadWeeklyExtras } from "../src/jobs/weekly-extras";
import { createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const DAY = 86_400_000;

describe("contexto de los correos", () => {
  it("el aviso de fuego trae los lotes ordenados por distancia al foco y los focos por día", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
    const now = Date.now();
    // el lote 1 está en (-55,9; -27,2): un foco 0,05 grados al este queda más cerca de él que de los otros
    await db()
      .insert(s.fireHotspots)
      .values([
        { id: newId(), source: "firms", acquiredAt: now - 3_600_000, lon: -55.84, lat: -27.205 },
        { id: newId(), source: "firms", acquiredAt: now - DAY - 3_600_000, lon: -55.84, lat: -27.205 },
      ]);
    const rows = [{ id: "n1", farmId, kind: "fire", plotIds: JSON.stringify(plotIds), tz: "America/Asuncion" }];
    const ctx = (await loadAlertContexts(db(), rows, now)).get("n1")!;
    expect(ctx.plots).toHaveLength(3);
    expect(ctx.plots.every((p) => typeof p.distKm === "number")).toBe(true);
    expect(ctx.hotspotsByDay).toHaveLength(7);
    expect(ctx.hotspotsByDay!.reduce((a, d) => a + d.n, 0)).toBe(2);
    const dist = ctx.plots.map((p) => p.distKm!);
    expect(Math.min(...dist)).toBeLessThan(Math.max(...dist));
  });

  it("los tipos que no usan pronóstico ni lluvia no leen esas tablas", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const ctx = (await loadAlertContexts(db(), [{ id: "n1", farmId, kind: "senacsa", plotIds: "[]", tz: "America/Asuncion" }], Date.now())).get("n1")!;
    expect(ctx.days).toEqual([]);
    expect(ctx.hours).toEqual([]);
    expect(ctx.rainDaily).toEqual([]);
    expect(ctx.hotspotsByDay).toBeUndefined();
  });

  it("el parte lista los lotes que bajaron de vigor con su serie y cuenta la semana anterior", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const now = Date.now();
    const stat = (plotId: string, daysAgo: number, mean: number): typeof s.plotIndexStats.$inferInsert => ({
      id: newId(),
      organizationId: owner.orgId,
      plotId,
      sceneId: newId(),
      acquiredAt: now - daysAgo * DAY,
      idx: "ndvi",
      mean,
      p10: mean - 0.1,
      p90: mean + 0.1,
      validPct: 100,
      createdAt: now,
      updatedAt: now,
    });
    await db()
      .insert(s.plotIndexStats)
      .values([stat(plotIds[0]!, 20, 0.7), stat(plotIds[0]!, 10, 0.72), stat(plotIds[0]!, 2, 0.4), stat(plotIds[1]!, 10, 0.6), stat(plotIds[1]!, 2, 0.65)]);
    const farm = { id: farmId, organizationId: owner.orgId, name: "La Esperanza", tz: "America/Asuncion" };
    const extras = await loadWeeklyExtras(db(), farm as never, now);
    expect(extras.worsened).toHaveLength(1);
    expect(extras.worsened![0]).toMatchObject({ name: "Lote 1", from: 0.72, to: 0.4 });
    expect(extras.worsened![0]!.series).toEqual([0.7, 0.72, 0.4]);
    expect(extras.prevRecords).toBe(0);
    expect(extras.tasksTotal).toBe(0);
  });
});
