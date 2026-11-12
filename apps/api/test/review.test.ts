import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS, newId, recordOddities } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, square } from "./helpers";
import { push, rec } from "./records-helpers";

// 20 de septiembre de 2026: invierno, fuera de la época de chinche, oruga y roya
const NOW = Date.UTC(2026, 8, 20, 15);
const DAY = 86_400_000;
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => vi.useRealTimers());

const review = (token: string) => call<any[]>("GET", "/org/review", { token });
const rules = (items: any[]) => items.flatMap((i) => i.oddities.map((o: any) => o.rule)).sort();

async function product(token: string, unit: "l" | "kg" = "l") {
  const r = await call<{ id: string }>("POST", "/org/products", { token, body: { name: "Glifosato", type: "agrochemical", unit } });
  return r.body.id;
}

describe("reglas de registros raros (X-26)", () => {
  it("lluvia diaria por encima del umbral", () => {
    expect(recordOddities("rain", { mm: 80, readAt: 0 }, NOW)).toEqual([]);
    expect(recordOddities("rain", { mm: LIMITS.oddities.rainMmPerDay, readAt: 0 }, NOW)).toEqual([]);
    expect(recordOddities("rain", { mm: 300, readAt: 0 }, NOW)).toEqual([{ rule: "rain_high", mm: 300, max: LIMITS.oddities.rainMmPerDay }]);
  });

  it("plaga fuera de su época (se admite cruzar el año); malezas y otras no tienen época", () => {
    const at = (m: number) => Date.UTC(2026, m - 1, 15, 15);
    expect(recordOddities("pest", { pest: "chinche", intensity: "low" }, at(1))).toEqual([]);
    expect(recordOddities("pest", { pest: "chinche", intensity: "low" }, at(12))).toEqual([]);
    expect(recordOddities("pest", { pest: "chinche", intensity: "low" }, at(5))).toEqual([]);
    expect(recordOddities("pest", { pest: "chinche", intensity: "low" }, at(7))).toEqual([{ rule: "pest_off_season", pest: "chinche", month: 7 }]);
    expect(recordOddities("pest", { pest: "roya", intensity: "low" }, at(9))).toHaveLength(1);
    expect(recordOddities("pest", { pest: "malezas", intensity: "low" }, at(7))).toEqual([]);
  });

  it("dosis fuera del rango del producto, con conversión de unidades y solo si el producto tiene rango", () => {
    const id = newId();
    const ranges = new Map([[id, { min: 1, max: 3, unit: "l" as const }]]);
    const app = (dose: number, unit: string, productId: string | null = id) => ({ products: [{ ...(productId ? { productId } : {}), name: "Glifo", dose, unit }] });
    expect(recordOddities("application", app(2, "l_ha"), NOW, { doseRanges: ranges })).toEqual([]);
    expect(recordOddities("application", app(2000, "ml_ha"), NOW, { doseRanges: ranges })).toEqual([]);
    expect(recordOddities("application", app(6, "l_ha"), NOW, { doseRanges: ranges })).toMatchObject([{ rule: "dose_out_of_range", dose: 6, min: 1, max: 3 }]);
    expect(recordOddities("application", app(200, "ml_ha"), NOW, { doseRanges: ranges })).toHaveLength(1);
    // otra familia de unidad (kg para un producto en litros) y producto sin rango o escrito a mano: no se juzga
    expect(recordOddities("application", app(50, "kg_ha"), NOW, { doseRanges: ranges })).toEqual([]);
    expect(recordOddities("application", app(50, "l_ha", newId()), NOW, { doseRanges: ranges })).toEqual([]);
    expect(recordOddities("application", app(50, "l_ha", null), NOW, { doseRanges: ranges })).toEqual([]);
    expect(recordOddities("application", app(50, "l_ha"), NOW)).toEqual([]);
  });

  it("rinde imposible según el cultivo del lote, con la superficie del registro o la del lote", () => {
    const plot = { crop: "soja", areaHa: 50 };
    expect(recordOddities("harvest", { tons: 150 }, NOW, { plot })).toEqual([]); // 3 t/ha
    expect(recordOddities("harvest", { tons: 600 }, NOW, { plot })).toEqual([{ rule: "yield_impossible", tHa: 12, max: 7, crop: "soja" }]);
    expect(recordOddities("harvest", { tons: 600, areaHa: 200 }, NOW, { plot })).toEqual([]); // la superficie del registro manda
    expect(recordOddities("harvest", { tons: 600 }, NOW, { plot: { crop: null, areaHa: 50 } })).toEqual([]);
    expect(recordOddities("harvest", { tons: 600 }, NOW, {})).toEqual([]);
    expect(recordOddities("scouting", { condition: "good" }, NOW)).toEqual([]);
  });
});

describe("Para revisar", () => {
  it("lista los registros raros con sus motivos y deja afuera los normales", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const plotId = plotIds[0]!;
    await db().update(s.plots).set({ crop: "soja", areaHa: 50 }).where(eq(s.plots.id, plotId));
    const pid = await product(owner.token);
    expect((await call("PUT", `/org/products/${pid}/dose-range`, { token: owner.token, body: { min: 1, max: 3 } })).status).toBe(200);

    const cap = NOW - 10 * DAY;
    const res = await push(owner.token, [
      rec(farmId, plotId, "rain", { mm: 300, readAt: cap }, cap),
      rec(farmId, plotId, "rain", { mm: 25, readAt: cap }, cap),
      rec(farmId, plotId, "pest", { pest: "chinche", intensity: "low" }, cap),
      rec(farmId, plotId, "application", { products: [{ productId: pid, name: "Glifosato", dose: 9, unit: "l_ha" }] }, cap),
      rec(farmId, plotId, "application", { products: [{ productId: pid, name: "Glifosato", dose: 2, unit: "l_ha" }] }, cap),
      rec(farmId, plotId, "harvest", { tons: 1000 }, cap),
      rec(farmId, plotId, "harvest", { tons: 150 }, cap),
    ]);
    expect(res.status).toBe(200);
    const items = (await review(owner.token)).body;
    expect(items).toHaveLength(4);
    expect(rules(items)).toEqual(["dose_out_of_range", "pest_off_season", "rain_high", "yield_impossible"]);
    expect(items[0]).toMatchObject({ farmId, farmName: "La Esperanza", plotName: expect.any(String), authorName: "Dueño" });
  });

  it("no mira registros viejos ni borrados", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const old = rec(farmId, plotIds[0]!, "rain", { mm: 400, readAt: 0 }, NOW - (LIMITS.oddities.windowDays + 5) * DAY);
    const gone = rec(farmId, plotIds[0]!, "rain", { mm: 400, readAt: 0 }, NOW - DAY);
    await push(owner.token, [old, gone]);
    expect((await review(owner.token)).body).toHaveLength(1);
    await push(owner.token, [{ mutationId: newId(), kind: "records.delete", row: { id: gone.row.id } }]);
    expect((await review(owner.token)).body).toHaveLength(0);
  });

  it("'Está bien' saca el registro del listado y vuelve a marcarse si se lo edita", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const m = rec(farmId, plotIds[0]!, "rain", { mm: 320, readAt: 0 }, NOW - DAY);
    await push(owner.token, [m]);
    expect((await review(owner.token)).body).toHaveLength(1);

    vi.setSystemTime(NOW + 1000);
    expect((await call("POST", `/org/review/${m.row.id}/ok`, { token: owner.token })).status).toBe(200);
    expect((await review(owner.token)).body).toHaveLength(0);

    // editado después de la revisión, sigue raro: vuelve
    vi.setSystemTime(NOW + 60_000);
    await push(owner.token, [{ ...m, mutationId: newId(), row: { ...m.row, data: { mm: 340, readAt: 0 } } }]);
    expect((await review(owner.token)).body).toHaveLength(1);
    // se corrige a un valor normal: no vuelve
    vi.setSystemTime(NOW + 120_000);
    await push(owner.token, [{ ...m, mutationId: newId(), row: { ...m.row, data: { mm: 34, readAt: 0 } } }]);
    expect((await review(owner.token)).body).toHaveLength(0);
  });
});

describe("permisos (X-26)", () => {
  it("el empleado y el contratista no ven ni cierran revisiones; los demás roles sí", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const m = rec(farmId, plotIds[0]!, "rain", { mm: 500, readAt: 0 }, NOW - DAY);
    await push(owner.token, [m]);
    for (const role of ["worker", "contractor"] as const) {
      const who = await addMemberAndLogin(owner.token, role);
      expect((await review(who.token)).status).toBe(403);
      expect((await call("POST", `/org/review/${m.row.id}/ok`, { token: who.token })).status).toBe(403);
    }
    for (const role of ["admin", "agronomist", "supervisor"] as const) {
      const who = await addMemberAndLogin(owner.token, role, role);
      if (role === "supervisor") await call("PUT", `/org/members/${who.userId}/farms`, { token: owner.token, body: { farms: [{ farmId, level: "edit" }] } });
      expect((await review(who.token)).status).toBe(200);
    }
    expect((await review(owner.token)).status).toBe(200);
    expect((await call("GET", "/org/review")).status).toBe(401);
  });

  it("el supervisor limitado a una estancia solo ve lo de ella", async () => {
    const owner = await createOrgWithOwner();
    const a = await createFarmWithPlots(owner.token, 1);
    const b = await call<{ id: string }>("POST", "/org/farms", { token: owner.token, body: { name: "Otra", geometry: square(-56.5, -26.5, 0.1) } });
    await push(owner.token, [rec(a.farmId, null, "rain", { mm: 500, readAt: 0 }, NOW - DAY), rec(b.body.id, null, "rain", { mm: 600, readAt: 0 }, NOW - DAY)]);
    const sup = await addMemberAndLogin(owner.token, "supervisor", "Sup");
    await call("PUT", `/org/members/${sup.userId}/farms`, { token: owner.token, body: { farms: [{ farmId: a.farmId, level: "edit" }] } });
    expect((await review(owner.token)).body).toHaveLength(2);
    const mine = (await review(sup.token)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]!.farmId).toBe(a.farmId);
  });

  it("no se cierra la revisión de un registro de otra organización", async () => {
    const a = await createOrgWithOwner("A");
    const fa = await createFarmWithPlots(a.token, 1);
    const m = rec(fa.farmId, null, "rain", { mm: 500, readAt: 0 }, NOW - DAY);
    await push(a.token, [m]);
    const b = await createOrgWithOwner("B");
    expect((await review(b.token)).body).toHaveLength(0);
    expect((await call("POST", `/org/review/${m.row.id}/ok`, { token: b.token })).status).toBe(404);
    expect((await review(a.token)).body).toHaveLength(1);
  });

  it("la dosis habitual la editan dueño, administrador y agrónomo; valida y se puede quitar", async () => {
    const owner = await createOrgWithOwner();
    const pid = await product(owner.token);
    const put = (token: string, body: unknown) => call("PUT", `/org/products/${pid}/dose-range`, { token, body });
    for (const role of ["supervisor", "worker", "contractor"] as const) {
      expect((await put((await addMemberAndLogin(owner.token, role, role)).token, { min: 1, max: 2 })).status).toBe(403);
    }
    for (const role of ["admin", "agronomist"] as const) {
      expect((await put((await addMemberAndLogin(owner.token, role, role)).token, { min: 1, max: 2 })).status).toBe(200);
    }
    expect((await put(owner.token, { min: 5, max: 2 })).status).toBe(400);
    expect((await put(owner.token, { min: -1, max: 2 })).status).toBe(400);
    expect((await put(owner.token, { min: 1, max: 3 })).status).toBe(200);
    expect((await call<any[]>("GET", "/org/products/dose-ranges", { token: owner.token })).body).toEqual([{ productId: pid, min: 1, max: 3 }]);
    expect((await put(owner.token, { min: null, max: null })).status).toBe(200);
    expect((await call<any[]>("GET", "/org/products/dose-ranges", { token: owner.token })).body).toEqual([]);
    // producto de otra organización
    const other = await createOrgWithOwner("Otra");
    expect((await call("PUT", `/org/products/${pid}/dose-range`, { token: other.token, body: { min: 1, max: 2 } })).status).toBe(404);
  });
});
