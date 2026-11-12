/** R-08: comparación anónima con la zona. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { SystemDb } from "../src/db/system";
import { benchmarkJob, haversineKm, median } from "../src/jobs/benchmark";
import { addMemberAndLogin, call, createOrgWithOwner, db, square } from "./helpers";

const NOW = Date.now();
const today = new Date(NOW).toISOString().slice(0, 10);

/** Una organización con una estancia de un lote en (lon, lat), con vigor y lluvia de los últimos días. */
async function farmAt(lon: number, lat: number, ndvi: number, rain: number) {
  const o = await createOrgWithOwner();
  const farm = await call<{ id: string }>("POST", "/org/farms", {
    token: o.token,
    body: { name: "Nombre secreto", geometry: square(lon, lat, 0.02) },
  });
  const plots = await call<{ ids: string[] }>("POST", `/org/farms/${farm.body.id}/plots`, {
    token: o.token,
    body: { plots: [{ name: "Lote secreto", kind: "crop", geometry: square(lon + 0.002, lat - 0.002, 0.01) }] },
  });
  await db().insert(s.plotIndexStats).values({
    id: newId(), organizationId: o.orgId, plotId: plots.body.ids[0]!, sceneId: newId(), acquiredAt: NOW - 86_400_000,
    idx: "ndvi", mean: ndvi, p10: 0.3, p90: 0.8, validPct: 90, createdAt: 1, updatedAt: 1, version: 1,
  });
  await db().insert(s.climateDaily).values({ farmId: farm.body.id, plotId: "", date: today, source: "chirps", precipMm: rain });
  return { ...o, farmId: farm.body.id, lon: lon + 0.01, lat: lat - 0.01 };
}

const run = async (f: { farmId: string; orgId: string; lon: number; lat: number }) =>
  benchmarkJob(new SystemDb(db()), { id: f.farmId, organizationId: f.orgId, lon: f.lon, lat: f.lat }, NOW);

describe("R-08 · comparación anónima con la zona", () => {
  it("mediana, distancia y mediana de pares e impares", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(haversineKm(-57, -25, -57, -25)).toBe(0);
    expect(haversineKm(-57, -25, -57, -24)).toBeGreaterThan(110);
    expect(haversineKm(-57, -25, -57, -24)).toBeLessThan(112);
  });

  it("con 3 estancias de otras organizaciones cerca guarda las medianas y no expone nada ajeno", async () => {
    const me = await farmAt(-57.0, -25.0, 0.6, 40);
    await farmAt(-57.05, -25.0, 0.5, 20);
    await farmAt(-57.1, -25.05, 0.7, 60);
    await farmAt(-56.95, -25.05, 0.8, 80);
    await farmAt(-52.0, -25.0, 0.1, 500); // lejos: no entra
    expect(await run(me)).toBe("saved");
    const r = await call<any>("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: me.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nFarms: 3, radiusKm: 30, ndvi: 0.6, ndviMedian: 0.7, rainMm: 40, rainMedianMm: 60 });
    // solo números y conteos: ni ids, ni nombres, ni geometrías
    expect(Object.keys(r.body).sort()).toEqual(
      ["computedAt", "ndvi", "ndviMedian", "nFarms", "radiusKm", "rainMedianMm", "rainMm", "windowDays"].sort(),
    );
    expect(JSON.stringify(r.body)).not.toMatch(/secreto|geometry|farmId/);
  });

  it("con menos de 3 estancias ajenas no publica nada (y borra lo anterior)", async () => {
    const me = await farmAt(-50.0, -22.0, 0.6, 40);
    await farmAt(-50.05, -22.0, 0.5, 20);
    await farmAt(-50.1, -22.05, 0.7, 60);
    expect(await run(me)).toBe("cleared");
    expect((await call("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: me.token })).body).toBeNull();
    // la tercera llega: se publica; si luego se va, vuelve a quedar vacío
    const third = await farmAt(-49.95, -22.05, 0.8, 80);
    expect(await run(me)).toBe("saved");
    expect((await call<any>("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: me.token })).body.nFarms).toBe(3);
    await db().update(s.farms).set({ deletedAt: 1 }).where(eq(s.farms.id, third.farmId));
    expect(await run(me)).toBe("cleared");
    expect((await call("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: me.token })).body).toBeNull();
  });

  it("estancias de la misma organización no cuentan como vecinas", async () => {
    const me = await farmAt(-48.0, -20.0, 0.6, 40);
    // tres estancias más de la MISMA organización
    for (const dx of [0.05, 0.1, 0.15]) {
      await call("POST", "/org/farms", { token: me.token, body: { name: "Propia", geometry: square(-48.0 + dx, -20.0, 0.02) } });
    }
    expect(await run(me)).toBe("cleared");
  });

  it("tres estancias de solo 2 organizaciones no alcanzan", async () => {
    const me = await farmAt(-46.0, -18.0, 0.6, 40);
    const other = await farmAt(-46.05, -18.0, 0.5, 20);
    for (const dx of [0.05, 0.1]) {
      await call("POST", "/org/farms", { token: other.token, body: { name: "X", geometry: square(-46.0 - dx, -18.05, 0.02) } });
    }
    expect(await run(me)).toBe("cleared");
  });

  it("la medida que a los vecinos les falta queda sin mediana en vez de inventarse", async () => {
    const me = await farmAt(-44.0, -16.0, 0.6, 40);
    for (const dx of [0.05, 0.1, 0.15]) {
      const o = await createOrgWithOwner();
      await call("POST", "/org/farms", { token: o.token, body: { name: "Sin datos", geometry: square(-44.0 - dx, -16.0, 0.02) } });
    }
    expect(await run(me)).toBe("saved");
    const r = await call<any>("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: me.token });
    expect(r.body).toMatchObject({ nFarms: 3, ndvi: 0.6, ndviMedian: null, rainMm: 40, rainMedianMm: null });
  });

  it("lo ve la organización dueña de la estancia y no los empleados ni otras organizaciones", async () => {
    const me = await farmAt(-42.0, -14.0, 0.6, 40);
    for (const dx of [0.05, 0.1, 0.15]) await farmAt(-42.0 - dx, -14.0, 0.5, 20);
    await run(me);
    const worker = await addMemberAndLogin(me.token, "worker");
    expect((await call("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: worker.token })).status).toBe(403);
    const other = await createOrgWithOwner();
    expect((await call("GET", `/org/farms/${me.farmId}/zone-benchmark`, { token: other.token })).status).toBe(404);
  });
});
