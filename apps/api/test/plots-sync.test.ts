import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, pullAll, square } from "./helpers";
import { push, rec } from "./records-helpers";

const plot = (farmId: string, over: Record<string, unknown> = {}) => ({
  mutationId: newId(),
  kind: "plots.upsert",
  row: { id: newId(), farmId, name: "Lote dibujado", kind: "crop", crop: "soja", geometry: square(-55.89, -27.21, 0.004), ...over },
});

describe("M-03 · lotes dibujados y editados desde la app (plots.upsert)", () => {
  it("crea un lote con área y bbox calculados por el servidor, lo baja por pull y lo edita", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const m = plot(farmId);
    expect((await push(owner.token, [m])).body.results[0]).toMatchObject({ status: "applied" });
    const row = (await pullAll(owner.token, "plots")).find((p) => p.id === m.row.id);
    expect(row).toMatchObject({ name: "Lote dibujado", kind: "crop", crop: "soja", farmId });
    expect(row.areaHa).toBeGreaterThan(15);
    expect(row.minLon).toBeCloseTo(-55.89, 5);
    // reintento idempotente
    expect((await push(owner.token, [m])).body.results[0]).toMatchObject({ status: "duplicate" });

    // edición: cambia forma y tipo; conserva lo que la app no manda (campaña, color)
    await db().update(s.plots).set({ color: "#112233", season: "zafra" }).where(eq(s.plots.id, m.row.id));
    const edit = { mutationId: newId(), kind: "plots.upsert", row: { ...m.row, name: "Potrero norte", kind: "pasture", crop: "soja", geometry: square(-55.89, -27.21, 0.008) } };
    expect((await push(owner.token, [edit])).body.results[0]).toMatchObject({ status: "applied" });
    const after = (await pullAll(owner.token, "plots")).find((p) => p.id === m.row.id);
    expect(after).toMatchObject({ name: "Potrero norte", kind: "pasture", crop: null, color: "#112233", season: "zafra" });
    expect(after.areaHa).toBeGreaterThan(row.areaHa * 3);
  });

  it("un registro puede apuntar al lote recién creado en el mismo push", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const p = plot(farmId);
    const r = await push(owner.token, [p, rec(farmId, p.row.id, "note", { text: "recién dibujado" })]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied"]);
  });

  it("permisos: dueño, administrador y agrónomo; el empleado no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    for (const who of [admin, agro]) expect((await push(who.token, [plot(farmId)])).body.results[0].status).toBe("applied");
    expect((await push(worker.token, [plot(farmId)])).body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden" });
    // el empleado tampoco edita un lote existente
    const edit = { mutationId: newId(), kind: "plots.upsert", row: { id: plotIds[0], farmId, name: "x", kind: "crop", crop: null, geometry: square(-55.89, -27.21, 0.004) } };
    expect((await push(worker.token, [edit])).body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden" });
  });

  it("aislamiento: no pisa un lote de otra organización ni crea en una estancia ajena; no mueve de estancia", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const other = await createOrgWithOwner("Otra");
    const theirs = await createFarmWithPlots(other.token, 1);
    const steal = { mutationId: newId(), kind: "plots.upsert", row: { id: theirs.plotIds[0], farmId, name: "robado", kind: "crop", crop: null, geometry: square(-55.89, -27.21, 0.004) } };
    expect((await push(owner.token, [steal])).body.results[0]).toMatchObject({ status: "rejected", reason: "not_found" });
    expect((await push(owner.token, [plot(theirs.farmId)])).body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden", detail: "farm" });
    const second = await call<{ id: string }>("POST", "/org/farms", { token: owner.token, body: { name: "Otra estancia", geometry: square(-55.9, -27.2, 0.1) } });
    const move = { mutationId: newId(), kind: "plots.upsert", row: { id: plotIds[0], farmId: second.body.id, name: "x", kind: "crop", crop: null, geometry: square(-55.89, -27.21, 0.004) } };
    expect((await push(owner.token, [move])).body.results[0]).toMatchObject({ status: "rejected", reason: "invalid", detail: "farm" });
    expect((await pullAll(other.token, "plots")).find((p) => p.id === theirs.plotIds[0]).name).not.toBe("robado");
  });

  it("rechaza geometría inválida, lote diminuto, nombre vacío y lote borrado", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const open = { type: "Polygon", coordinates: [[[-55.9, -27.2], [-55.89, -27.2], [-55.89, -27.21], [-55.9, -27.21]]] };
    expect((await push(owner.token, [plot(farmId, { geometry: open })])).body.results[0]).toMatchObject({ status: "rejected", reason: "invalid", detail: "geometry" });
    expect((await push(owner.token, [plot(farmId, { geometry: { type: "Point", coordinates: [0, 0] } })])).body.results[0]).toMatchObject({ reason: "invalid" });
    expect((await push(owner.token, [plot(farmId, { geometry: square(-55.89, -27.21, 0.0001) })])).body.results[0]).toMatchObject({ reason: "invalid", detail: "area" });
    expect((await push(owner.token, [plot(farmId, { name: "  " })])).status).toBe(400);
    await call("DELETE", `/org/plots/${plotIds[0]}`, { token: owner.token });
    const edit = { mutationId: newId(), kind: "plots.upsert", row: { id: plotIds[0], farmId, name: "x", kind: "crop", crop: null, geometry: square(-55.89, -27.21, 0.004) } };
    expect((await push(owner.token, [edit])).body.results[0]).toMatchObject({ status: "rejected", reason: "deleted" });
  });

  it("respeta el tope de hectáreas del plan al crear lotes", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await db().update(s.organizations).set({ maxHa: 100 }).where(eq(s.organizations.id, owner.orgId));
    // ~19 ha por lote de 0,004°: el primero entra (ya hay un lote de createFarmWithPlots), uno enorme no
    const big = plot(farmId, { geometry: square(-55.89, -27.21, 0.05) });
    expect((await push(owner.token, [big])).body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden", detail: "plan" });
  });
});
