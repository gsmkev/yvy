/** G-22: pesadas y ganancia diaria de peso. */
import { describe, expect, it } from "vitest";
import { groupWeighings, parseRecordData, weightSeries } from "@yvy/shared";
import { addMemberAndLogin, call, createOrgWithOwner } from "./helpers";
import { DAY, setupHerd } from "./herd-helpers";
import { push, rec } from "./records-helpers";

const T0 = Date.UTC(2026, 0, 10, 15);

describe("ganancia diaria de peso (puro)", () => {
  it("(peso final - peso inicial) / días, y la tendencia de las dos últimas", () => {
    const s = weightSeries("a", "Novillos", [
      { at: T0, kg: 300, head: 20 },
      { at: T0 + 30 * DAY, kg: 330, head: 20 },
      { at: T0 + 40 * DAY, kg: 345, head: 20 },
    ]);
    expect(s).toMatchObject({ firstKg: 300, lastKg: 345, gainKg: 45, days: 40, adgKg: 1.125, lastAdgKg: 1.5 });
  });
  it("una sola pesada o menos de un día entre pesadas no da ganancia", () => {
    expect(weightSeries("a", null, [{ at: T0, kg: 300, head: 1 }])).toMatchObject({ adgKg: null, gainKg: null });
    expect(weightSeries("a", null, [{ at: T0, kg: 300, head: 1 }, { at: T0 + 3_600_000, kg: 301, head: 1 }]).adgKg).toBeNull();
  });
  it("varias pesadas del mismo día se promedian ponderando por cabezas", () => {
    const s = weightSeries("a", null, [
      { at: T0, kg: 300, head: 10 },
      { at: T0 + 1000, kg: 330, head: 30 },
      { at: T0 + 10 * DAY, kg: 330, head: 40 },
    ]);
    expect(s.points[0]).toMatchObject({ kg: 322.5, head: 40 });
    expect(s.adgKg).toBeCloseTo(0.75);
  });
  it("las pesadas con caravana cuentan solo para el animal; el lote no distingue mayúsculas", () => {
    const g = groupWeighings([
      { capturedAt: T0, kg: 300, head: 10, group: "Lote A", tag: null },
      { capturedAt: T0 + 20 * DAY, kg: 320, head: 10, group: "lote a", tag: null },
      { capturedAt: T0, kg: 500, head: 1, group: "Lote A", tag: "PY-1" },
      { capturedAt: T0 + 20 * DAY, kg: 520, head: 1, group: null, tag: "PY-1" },
    ]);
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0]).toMatchObject({ label: "Lote A", adgKg: 1 });
    expect(g.animals).toHaveLength(1);
    expect(g.animals[0]).toMatchObject({ key: "PY-1", adgKg: 1 });
  });
});

describe("registro weighing", () => {
  it("valida peso, caravana y cabezas; la caravana se guarda en mayúsculas", () => {
    expect(parseRecordData("weighing", { kg: 350 }).success).toBe(true);
    expect(parseRecordData("weighing", { kg: 350, head: 12, group: "Novillos" }).success).toBe(true);
    const tag = parseRecordData("weighing", { kg: 350, tag: " py-0012 " });
    expect(tag.success && (tag.data as { tag?: string }).tag).toBe("PY-0012");
    expect(parseRecordData("weighing", { kg: 0 }).success).toBe(false);
    expect(parseRecordData("weighing", { kg: 5000 }).success).toBe(false);
    expect(parseRecordData("weighing", { kg: 350, tag: "AB 12" }).success).toBe(false);
    expect(parseRecordData("weighing", { kg: 350, tag: "AB12", head: 3 }).success).toBe(false);
  });

  it("se sincroniza sin potrero; el empleado solo anota en los suyos o sin potrero", async () => {
    const { owner, worker, farmId, plotIds } = await setupHerd();
    const r = await push(owner.token, [rec(farmId, null, "weighing", { kg: 300, group: "A" })]);
    expect(r.body.results[0].status).toBe("applied");
    const w = await push(worker.token, [
      rec(farmId, plotIds[0]!, "weighing", { kg: 300 }),
      rec(farmId, plotIds[3]!, "weighing", { kg: 300 }),
    ]);
    expect(w.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
  });
});

describe("GET /org/farms/:id/weighings", () => {
  it("agrupa por lote y por caravana con la ganancia diaria", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "weighing", { kg: 300, head: 20, group: "Novillos 2025" }, now - 60 * DAY),
      rec(farmId, plotIds[0]!, "weighing", { kg: 345, head: 20, group: "novillos 2025" }, now - 30 * DAY),
      rec(farmId, null, "weighing", { kg: 400, tag: "PY-77" }, now - 50 * DAY),
      rec(farmId, null, "weighing", { kg: 430, tag: "PY-77" }, now - 20 * DAY),
      rec(farmId, null, "weighing", { kg: 100 }, now - 900 * DAY), // fuera del último año
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/weighings`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0]).toMatchObject({ label: "Novillos 2025", gainKg: 45, adgKg: 1.5 });
    expect(res.body.animals).toHaveLength(1);
    expect(res.body.animals[0]).toMatchObject({ key: "PY-77", adgKg: 1 });
    const all = await call<any>("GET", `/org/farms/${farmId}/weighings?from=0`, { token: owner.token });
    expect(all.body.groups).toHaveLength(2); // aparece el "sin lote"
  });

  it("permisos: no es para el empleado; no mezcla organizaciones", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/weighings`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/weighings`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/weighings`, { token: other.token })).status).toBe(404);
  });
});
