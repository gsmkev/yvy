import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";
import { push } from "./records-helpers";

const config = {
  rain: [
    { id: "pluviometro", label: "Pluviómetro de la casa", type: "yesno" },
    { id: "viento", label: "Viento", type: "choice", options: ["calmo", "moderado", "fuerte"], required: true },
  ],
  scouting: [{ id: "altura", label: "Altura de plantas", type: "number", unit: "cm" }],
};

const record = (farmId: string, plotId: string, data: unknown, kind = "scouting") => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: { id: newId(), farmId, plotId, poiId: null, kind, data, schemaVersion: RECORD_SCHEMA_VERSION, lon: null, lat: null, gpsAccuracyM: null, capturedAt: Date.now() - 1000 },
});

describe("F-14 · formularios configurables por la organización", () => {
  it("dueño y administrador los definen; todo el equipo los lee; el agrónomo y el empleado no los cambian", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    const other = await createOrgWithOwner("Otra");

    expect((await call<any>("GET", "/org/form-config", { token: owner.token })).body).toEqual({ config: {}, updatedAt: null });
    expect((await call("PUT", "/org/form-config", { token: owner.token, body: config })).status).toBe(200);
    expect((await call("PUT", "/org/form-config", { token: admin.token, body: { scouting: [] } })).status).toBe(200);
    expect((await call("PUT", "/org/form-config", { token: agro.token, body: config })).status).toBe(403);
    expect((await call("PUT", "/org/form-config", { token: worker.token, body: config })).status).toBe(403);
    expect((await call("PUT", "/org/form-config", { body: config })).status).toBe(401);

    await call("PUT", "/org/form-config", { token: owner.token, body: config });
    for (const who of [owner, admin, agro, worker]) {
      const r = await call<any>("GET", "/org/form-config", { token: who.token });
      expect(r.status).toBe(200);
      expect(r.body.config.rain[1]).toMatchObject({ id: "viento", options: ["calmo", "moderado", "fuerte"], required: true });
    }
    // otra organización: su propia configuración, vacía
    expect((await call<any>("GET", "/org/form-config", { token: other.token })).body.config).toEqual({});
  });

  it("valida la definición: ids, tipos, opciones, repetidos y límites", async () => {
    const owner = await createOrgWithOwner();
    const put = (body: unknown) => call("PUT", "/org/form-config", { token: owner.token, body });
    const f = (over: Record<string, unknown>) => ({ rain: [{ id: "a", label: "A", type: "text", ...over }] });
    expect((await put(f({ id: "Mayúscula" }))).status).toBe(400);
    expect((await put(f({ id: "1ab" }))).status).toBe(400);
    expect((await put(f({ type: "fecha" }))).status).toBe(400);
    expect((await put(f({ label: "  " }))).status).toBe(400);
    expect((await put(f({ type: "choice" }))).status).toBe(400); // sin opciones
    expect((await put(f({ type: "choice", options: ["x", "x"] }))).status).toBe(400); // repetidas
    expect((await put({ inventado: [] })).status).toBe(400);
    expect((await put({ rain: [{ id: "a", label: "A", type: "text" }, { id: "a", label: "B", type: "text" }] })).status).toBe(400);
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, type: "text" }));
    expect((await put({ note: many })).status).toBe(400);
    expect((await put({ note: many.slice(0, 10) })).status).toBe(200);
  });

  it("los registros guardan las respuestas propias en data.extra y las devuelven por pull", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const m = record(farmId, plotIds[0]!, { condition: "good", extra: { altura: 35.5, nota_extra: "ok", riego: true } });
    expect((await push(owner.token, [m])).body.results[0]).toMatchObject({ status: "applied" });
    const row = (await pullAll(owner.token, "records")).find((r) => r.id === m.row.id);
    expect(JSON.parse(row.data)).toEqual({ condition: "good", extra: { altura: 35.5, nota_extra: "ok", riego: true } });
  });

  it("rechaza respuestas propias inválidas; sin extra el registro sigue igual", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const bad = async (extra: unknown) =>
      (await push(owner.token, [record(farmId, plotIds[0]!, { condition: "good", extra })])).body.results[0];
    expect(await bad({ "Mala Clave": 1 })).toMatchObject({ status: "rejected", reason: "invalid" });
    expect(await bad({ a: { anidado: 1 } })).toMatchObject({ status: "rejected", reason: "invalid" });
    expect(await bad({ a: "x".repeat(501) })).toMatchObject({ status: "rejected", reason: "invalid" });
    expect(await bad(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 1])))).toMatchObject({ status: "rejected", reason: "invalid" });
    expect(await bad([1, 2])).toMatchObject({ status: "rejected", reason: "invalid" });
    // el esquema del tipo sigue mandando
    expect((await push(owner.token, [record(farmId, plotIds[0]!, { condition: "mala", extra: { a: 1 } })])).body.results[0]).toMatchObject({ reason: "invalid" });
    expect((await push(owner.token, [record(farmId, plotIds[0]!, { condition: "good" })])).body.results[0].status).toBe("applied");
  });
});
