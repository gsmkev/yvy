/** G-21: animales con caravana, búsqueda, historial y permisos. */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createOrgWithOwner, pullAll } from "./helpers";
import { DAY, setupHerd } from "./herd-helpers";
import { push, rec } from "./records-helpers";

const body = (tag: string, extra: object = {}) => ({ tag, category: "vaca", sex: "hembra", ...extra });
const create = (token: string, farmId: string, b: object) => call<any>("POST", `/org/farms/${farmId}/animals`, { token, body: b });

describe("alta, edición y baja", () => {
  it("guarda la caravana en mayúsculas y rechaza duplicados y formatos inválidos", async () => {
    const { owner, farmId } = await setupHerd();
    const a = await create(owner.token, farmId, body(" py-001 ", { birthDate: "2022-03-04" }));
    expect(a.status).toBe(201);
    const list = await call<any[]>("GET", `/org/farms/${farmId}/animals`, { token: owner.token });
    expect(list.body[0]).toMatchObject({ tag: "PY-001", birthDate: "2022-03-04" });
    expect((await create(owner.token, farmId, body("PY-001"))).status).toBe(409);
    expect((await create(owner.token, farmId, body("AB 1"))).status).toBe(400);
    expect((await create(owner.token, farmId, body("X1", { category: "oveja" }))).status).toBe(400);
    expect((await create(owner.token, farmId, body("X1", { sex: "?" }))).status).toBe(400);
  });

  it("edita, valida la caravana nueva y al borrar libera la caravana", async () => {
    const { owner, farmId } = await setupHerd();
    const a = (await create(owner.token, farmId, body("A1"))).body.id;
    await create(owner.token, farmId, body("A2"));
    expect((await call("PATCH", `/org/animals/${a}`, { token: owner.token, body: { tag: "A2" } })).status).toBe(409);
    expect((await call("PATCH", `/org/animals/${a}`, { token: owner.token, body: { category: "toro", sex: "macho" } })).status).toBe(200);
    expect((await call("DELETE", `/org/animals/${a}`, { token: owner.token })).status).toBe(200);
    expect((await create(owner.token, farmId, body("A1"))).status).toBe(201);
    expect((await call("DELETE", `/org/animals/${a}`, { token: owner.token })).status).toBe(404);
  });

  it("busca por parte de la caravana sin distinguir mayúsculas y sin comodines", async () => {
    const { owner, farmId } = await setupHerd();
    for (const t of ["PY-100", "PY-200", "AR-100"]) await create(owner.token, farmId, body(t));
    const q = async (s: string) => (await call<any[]>("GET", `/org/farms/${farmId}/animals?q=${encodeURIComponent(s)}`, { token: owner.token })).body.map((x) => x.tag);
    expect(await q("py")).toEqual(["PY-100", "PY-200"]);
    expect(await q("100")).toEqual(["AR-100", "PY-100"]);
    expect(await q("%")).toHaveLength(3); // el comodín se descarta, no coincide con todo por error de LIKE
    expect(await q("zzz")).toEqual([]);
  });
});

describe("permisos", () => {
  it("el empleado consulta (y baja al celular) pero no edita; otra organización no ve nada", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const id = (await create(owner.token, farmId, body("P1"))).body.id;
    expect((await create(worker.token, farmId, body("P2"))).status).toBe(403);
    expect((await call("PATCH", `/org/animals/${id}`, { token: worker.token, body: { note: "x" } })).status).toBe(403);
    expect((await call("DELETE", `/org/animals/${id}`, { token: worker.token })).status).toBe(403);
    expect((await create(agro.token, farmId, body("P3"))).status).toBe(201);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/animals?q=P1`, { token: worker.token })).body).toHaveLength(1);
    expect((await pullAll(worker.token, "animals")).map((a) => a.tag).sort()).toEqual(["P1", "P3"]);
    const other = await createOrgWithOwner("Otra");
    expect(await pullAll(other.token, "animals")).toEqual([]);
    expect((await call("GET", `/org/farms/${farmId}/animals`, { token: other.token })).status).toBe(404);
    expect((await call("GET", `/org/animals/${id}/history`, { token: other.token })).status).toBe(404);
    expect((await create(other.token, farmId, body("Z"))).status).toBe(404);
  });

  it("un empleado sin lotes en la estancia no ve sus animales", async () => {
    const { owner, farmId } = await setupHerd();
    await create(owner.token, farmId, body("P1"));
    const lone = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/animals`, { token: lone.token })).status).toBe(404);
    expect(await pullAll(lone.token, "animals")).toEqual([]);
  });
});

describe("historial", () => {
  it("junta pesadas, reproducción y sanidad con la caravana, con ganancia de peso", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const id = (await create(owner.token, farmId, body("PY-7"))).body.id;
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, null, "weighing", { kg: 300, tag: "PY-7" }, now - 40 * DAY),
      rec(farmId, null, "weighing", { kg: 340, tag: "py-7" }, now - 20 * DAY),
      rec(farmId, plotIds[0]!, "reproduction", { event: "service", tag: "PY-7" }, now - 10 * DAY),
      rec(farmId, plotIds[0]!, "health", { reason: "aftosa", product: "Vacuna", counts: { vaca: 1 }, tag: "PY-7" }, now - 5 * DAY),
      rec(farmId, null, "weighing", { kg: 999, tag: "OTRO" }, now - 3 * DAY),
      rec(farmId, null, "weighing", { kg: 999, group: "Lote" }, now - 3 * DAY),
    ]);
    const h = await call<any>("GET", `/org/animals/${id}/history`, { token: owner.token });
    expect(h.status).toBe(200);
    expect(h.body.records.map((r: any) => r.kind)).toEqual(["health", "reproduction", "weighing", "weighing"]);
    expect(h.body.weight).toMatchObject({ lastKg: 340, adgKg: 2 });
  });

  it("el empleado solo ve lo de sus lotes o lo que cargó; y las pesadas con caravana bajan al celular", async () => {
    const { owner, worker, farmId, plotIds } = await setupHerd();
    const id = (await create(owner.token, farmId, body("PY-8"))).body.id;
    const old = Date.now() - 90 * DAY;
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "reproduction", { event: "service", tag: "PY-8" }, old),
      rec(farmId, plotIds[3]!, "reproduction", { event: "service", tag: "PY-8" }, old), // lote ajeno
    ]);
    const h = await call<any>("GET", `/org/animals/${id}/history`, { token: worker.token });
    expect(h.body.records).toHaveLength(1);
    expect(h.body.records[0].plotId).toBe(plotIds[0]);
    // pasaron más de 30 días y aun así baja (tiene caravana)
    expect((await pullAll(worker.token, "records")).filter((r) => r.kind === "reproduction")).toHaveLength(1);
  });
});
