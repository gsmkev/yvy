/** Productos y registros de aplicación (ADR 0004, A-10 y A-12). */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, pullAll } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  const worker = await addMemberAndLogin(owner.token, "worker");
  const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Agrónoma");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]!] } });
  return { owner, worker, agro, farmId, plotIds };
}

const product = (over: Record<string, unknown> = {}) => ({
  name: "Glifosato 48",
  type: "agrochemical",
  unit: "l",
  activeIngredient: "glifosato",
  withdrawalDays: 15,
  ...over,
});

describe("productos", () => {
  it("el agrónomo los carga y edita; el empleado solo los ve y le bajan al celular", async () => {
    const { owner, worker, agro } = await setup();
    const created = await call<{ id: string }>("POST", "/org/products", { token: agro.token, body: product() });
    expect(created.status).toBe(201);
    expect((await call("POST", "/org/products", { token: worker.token, body: product() })).status).toBe(403);
    expect(
      (await call("PATCH", `/org/products/${created.body.id}`, { token: worker.token, body: { name: "x" } })).status,
    ).toBe(403);
    expect((await call("DELETE", `/org/products/${created.body.id}`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", "/org/products", { token: worker.token })).body).toHaveLength(1);
    expect((await pullAll(worker.token, "products")).map((p) => p.id)).toEqual([created.body.id]);
    expect(
      (await call("PATCH", `/org/products/${created.body.id}`, { token: owner.token, body: { withdrawalDays: 7 } })).status,
    ).toBe(200);
    const rows = await pullAll(owner.token, "products");
    expect(rows[0]).toMatchObject({ name: "Glifosato 48", withdrawalDays: 7, unit: "l" });
  });

  it("valida tipo, unidad y carencia", async () => {
    const { owner } = await setup();
    const post = (b: Record<string, unknown>) => call("POST", "/org/products", { token: owner.token, body: b });
    expect((await post(product({ type: "veneno" }))).status).toBe(400);
    expect((await post(product({ unit: "t" }))).status).toBe(400);
    expect((await post(product({ name: " " }))).status).toBe(400);
    expect((await post(product({ withdrawalDays: -1 }))).status).toBe(400);
    expect((await post(product({ activeIngredient: null, withdrawalDays: null }))).status).toBe(201);
  });

  it("son de la organización: otra no los ve ni los toca", async () => {
    const { owner } = await setup();
    const other = await createOrgWithOwner("Otra");
    const p = await call<{ id: string }>("POST", "/org/products", { token: owner.token, body: product() });
    expect((await call("GET", "/org/products", { token: other.token })).body).toEqual([]);
    expect((await call("DELETE", `/org/products/${p.body.id}`, { token: other.token })).status).toBe(404);
    expect(await pullAll(other.token, "products")).toEqual([]);
  });

  it("borrar es lógico y sale del listado", async () => {
    const { owner } = await setup();
    const p = await call<{ id: string }>("POST", "/org/products", { token: owner.token, body: product() });
    expect((await call("DELETE", `/org/products/${p.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await call("GET", "/org/products", { token: owner.token })).body).toEqual([]);
    expect((await pullAll(owner.token, "products"))[0].deletedAt).not.toBeNull();
  });
});

describe("registro de aplicación", () => {
  const send = (token: string, farmId: string, plotId: string | null, data: unknown) =>
    call("POST", "/sync/push", {
      token,
      body: {
        deviceId: "d",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId,
              plotId,
              poiId: null,
              kind: "application",
              data,
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: Date.now(),
            },
          },
        ],
      },
    });
  const dose = { productId: newId(), name: "Glifosato 48", dose: 2, unit: "l_ha" };

  it("el empleado registra en su lote; en uno ajeno se rechaza", async () => {
    const { worker, farmId, plotIds } = await setup();
    expect((await send(worker.token, farmId, plotIds[0]!, { products: [dose] })).body.results[0].status).toBe("applied");
    expect((await send(worker.token, farmId, plotIds[2]!, { products: [dose] })).body.results[0].status).toBe("rejected");
  });

  it("calcula y guarda el Delta T con temperatura y humedad", async () => {
    const { owner, farmId, plotIds } = await setup();
    const r = await send(owner.token, farmId, plotIds[0]!, {
      products: [dose, { name: "Aceite", dose: 500, unit: "ml_ha" }],
      volumeLHa: 80,
      areaHa: 25,
      windKmh: 9,
      tempC: 25,
      humidityPct: 50,
      // un deltaT mandado por el cliente se ignora: manda el cálculo del servidor
      deltaT: 99,
    });
    expect(r.body.results[0].status).toBe("applied");
    const rows = await db().select().from(s.records).where(eq(s.records.kind, "application"));
    const data = rows.map((x) => JSON.parse(x.data)).find((d) => d.volumeLHa === 80);
    expect(data.deltaT).toBeGreaterThan(5);
    expect(data.deltaT).toBeLessThan(9);
    expect(data.products).toHaveLength(2);
  });

  it("sin humedad no hay Delta T", async () => {
    const { owner, farmId } = await setup();
    await send(owner.token, farmId, null, { products: [dose], tempC: 26.5 });
    const rows = await db().select().from(s.records).where(eq(s.records.kind, "application"));
    const data = rows.map((x) => JSON.parse(x.data)).find((d) => d.tempC === 26.5);
    expect(data.deltaT).toBeUndefined();
  });

  it("rechaza datos inválidos", async () => {
    const { owner, farmId } = await setup();
    const bad = async (data: unknown) =>
      expect((await send(owner.token, farmId, null, data)).body.results[0].status).toBe("rejected");
    await bad({}); // sin productos
    await bad({ products: [] });
    await bad({ products: [{ ...dose, dose: 0 }] });
    await bad({ products: [{ ...dose, unit: "toneladas" }] });
    await bad({ products: [dose], humidityPct: 120 });
    await bad({ products: [dose], windKmh: -4 });
    await bad({ products: [dose], areaHa: -1 });
  });
});
