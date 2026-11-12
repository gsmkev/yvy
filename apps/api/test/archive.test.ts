/** P-06: archivado de datos viejos de D1 a R2. */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { eq } from "drizzle-orm";
import { archiveCutoff, archiveOld } from "../src/jobs/archive";
import { createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const on = { ...env, ARCHIVE_AFTER_MONTHS: "12" } as never;
const ago = (months: number) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
};

async function insertRecord(orgId: string, farmId: string, userId: string, kind: "rain" | "harvest", at: number) {
  const id = newId();
  await db().insert(s.records).values({
    id, organizationId: orgId, farmId, authorId: userId, kind, data: "{}", schemaVersion: 1, capturedAt: at, createdAt: at, updatedAt: at, version: 1,
  });
  return id;
}

describe("P-06 · archivado", () => {
  it("sin ARCHIVE_AFTER_MONTHS (o menor a 3) no hace nada", async () => {
    expect(archiveCutoff({}, NOW)).toBeNull();
    expect(archiveCutoff({ ARCHIVE_AFTER_MONTHS: "1" }, NOW)).toBeNull();
    expect(archiveCutoff({ ARCHIVE_AFTER_MONTHS: "abc" }, NOW)).toBeNull();
    const o = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(o.token, 1);
    const id = await insertRecord(o.orgId, farmId, o.userId, "rain", ago(20));
    expect(await archiveOld(env as never, db(), NOW)).toEqual([]);
    expect(await db().select().from(s.records).where(eq(s.records.id, id))).toHaveLength(1);
  });

  it("pasa a R2 los registros viejos con sus adjuntos, los borra de D1 y deja los recientes y los de tipo protegido", async () => {
    const o = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(o.token, 1);
    const old = await insertRecord(o.orgId, farmId, o.userId, "rain", ago(20));
    const recent = await insertRecord(o.orgId, farmId, o.userId, "rain", ago(2));
    const harvest = await insertRecord(o.orgId, farmId, o.userId, "harvest", ago(20));
    await db().insert(s.attachments).values({
      id: newId(), organizationId: o.orgId, recordId: old, storagePath: "p", thumbPath: "t", mime: "image/webp",
      createdAt: 1, updatedAt: 1, version: 1,
    });
    const res = await archiveOld(on, db(), NOW);
    expect(res.find((r) => r.table === "records")!.rows).toBeGreaterThanOrEqual(1);
    const left = (await db().select({ id: s.records.id }).from(s.records)).map((r) => r.id);
    expect(left).toContain(recent);
    expect(left).toContain(harvest);
    expect(left).not.toContain(old);
    expect(await db().select().from(s.attachments).where(eq(s.attachments.recordId, old))).toHaveLength(0);

    const month = new Date(ago(20)).toISOString().slice(0, 7);
    const listed = await env.MEDIA.list({ prefix: `archive/records/${month}/` });
    expect(listed.objects.length).toBeGreaterThan(0);
    const texts = await Promise.all(listed.objects.map(async (ob) => (await env.MEDIA.get(ob.key))!.text()));
    const lines = texts.join("").trim().split("\n").map((l) => JSON.parse(l) as { t: string; row: { id: string } });
    expect(lines.map((l) => l.t)).toContain("records");
    expect(lines.map((l) => l.t)).toContain("attachments");
    expect(lines.filter((l) => l.t === "records").map((l) => l.row.id)).toContain(old);
  });

  it("archiva estadísticas de vigor viejas", async () => {
    const o = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(o.token, 1);
    const id = newId();
    await db().insert(s.plotIndexStats).values({
      id, organizationId: o.orgId, plotId: plotIds[0]!, sceneId: "sc", acquiredAt: ago(30), idx: "ndvi", mean: 0.5, p10: 0.3, p90: 0.7, validPct: 90,
      createdAt: 1, updatedAt: 1, version: 1,
    });
    const res = await archiveOld(on, db(), NOW);
    expect(res.some((r) => r.table === "plot_index_stats")).toBe(true);
    expect(await db().select().from(s.plotIndexStats).where(eq(s.plotIndexStats.id, id))).toHaveLength(0);
  });
});
