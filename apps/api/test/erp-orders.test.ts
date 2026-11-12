/** E-20 y E-21: órdenes de trabajo (tareas con payload) y su cierre con superficie real, consumo y costo del contratista. */
import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { call, pullAll } from "./helpers";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";
import { push, rec } from "./records-helpers";

async function setup() {
  const s = await stockSetup();
  await buy(s.owner.token, s, 100, 1_000_000); // glifosato a 10.000 por l
  const c = await erpPost(s.owner.token, "contractors", { name: "Pulverizaciones Villalba", service: "spraying", rateUnit: "ha", rateAmount: 35_000, currency: "PYG" });
  return { ...s, contractorId: c.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;

const order = (s: S, extra: Record<string, unknown> = {}) => ({
  farmId: s.farmId,
  plotIds: [s.plotIds[0]],
  assigneeId: s.worker.userId,
  dueDate: "2026-11-20",
  order: { labor: "spraying", areaHa: 10, products: [{ productId: s.productId, name: "Glifosato", dose: 2, unit: "l_ha" }], contractorId: s.contractorId },
  ...extra,
});
const create = (token: string, body: unknown) => call<any>("POST", "/org/erp/work-orders", { token, body });
const list = async (token: string) => (await erpGet<any[]>(token, "work-orders")).body;

/** Cierra la orden como lo hace el celular: el registro con orderTaskId y la tarea hecha con ese registro. */
async function close(s: S, taskId: string, kind: string, data: Record<string, unknown>, plotId = s.plotIds[0]!) {
  const base = rec(s.farmId, plotId, kind, { ...data, orderTaskId: taskId });
  // T-03: las tareas de aplicación, cosecha, etc. se cierran con foto y ubicación
  const m = { ...base, row: { ...base.row, lon: -55.9, lat: -27.2 } };
  const photo = { mutationId: newId(), kind: "attachments.upsert", row: { id: newId(), recordId: m.row.id, mime: "image/webp", width: 100, height: 100, bytes: 1000 } };
  const done = { mutationId: newId(), kind: "tasks.status", row: { id: taskId, status: "done", completedAt: Date.now(), recordId: m.row.id } };
  const r = await push(s.worker.token, [m, photo, done]);
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied", "applied"]);
  return m.row.id as string;
}

describe("órdenes de trabajo (E-20)", () => {
  it("crea una tarea por lote con el payload, el tipo de registro de la labor y la receta; baja al operario", async () => {
    const s = await setup();
    const r = await create(s.owner.token, order(s, { plotIds: s.plotIds }));
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(2);
    const tasks = await pullAll(s.worker.token, "tasks");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ kind: "application", title: "Pulverización", assigneeId: s.worker.userId });
    expect(JSON.parse(tasks[0].workOrder)).toMatchObject({ labor: "spraying", areaHa: 10, contractorId: s.contractorId });
    expect(JSON.parse(tasks[0].prescription).products[0].productId).toBe(s.productId);
    const rows = await list(s.owner.token);
    expect(rows.map((x) => [x.status, x.plannedAreaHa])).toEqual([["open", 10], ["open", 10]]);
  });

  it("otras labores usan su tipo de registro; sin superficie prevista toma la del lote", async () => {
    const s = await setup();
    await create(s.owner.token, order(s, { order: { labor: "harvest" } }));
    await create(s.owner.token, order(s, { order: { labor: "other", note: "Reparar alambrado" } }));
    const tasks = await pullAll(s.worker.token, "tasks");
    expect(tasks.map((t) => t.kind).sort()).toEqual([null, "harvest"].sort());
    expect((await list(s.owner.token))[0].plannedAreaHa).toBeGreaterThan(0);
  });

  it("valida lotes, producto, contratista, labor y operario", async () => {
    const s = await setup();
    const ghost = "11111111-1111-4111-8111-111111111111";
    expect((await create(s.owner.token, order(s, { plotIds: [] }))).status).toBe(400);
    expect((await create(s.owner.token, order(s, { order: { labor: "volar" } }))).status).toBe(400);
    expect((await create(s.owner.token, order(s, { order: { labor: "spraying", contractorId: ghost } }))).status).toBe(404);
    expect((await create(s.owner.token, order(s, { order: { labor: "spraying", products: [{ productId: ghost, name: "x", dose: 1, unit: "l_ha" }] } }))).status).toBe(404);
    expect((await create(s.owner.token, order(s, { plotIds: [ghost] }))).status).toBe(404);
    expect((await create(s.owner.token, order(s, { assigneeId: ghost }))).status).toBeGreaterThanOrEqual(400);
  });

  it("el agrónomo crea y ve órdenes sin costos; el empleado no entra; el dueño ve el costo", async () => {
    const s = await setup();
    expect((await create(s.agro.token, order(s))).status).toBe(201);
    expect((await create(s.worker.token, order(s))).status).toBe(403);
    expect((await erpGet(s.worker.token, "work-orders")).status).toBe(403);
    expect((await list(s.agro.token))[0]).not.toHaveProperty("costPyg");
    expect((await list(s.owner.token))[0]).toHaveProperty("costPyg", 0);
  });
});

describe("cierre de la orden (E-21)", () => {
  it("el registro con la superficie real descuenta insumos y carga el costo del contratista por hectárea", async () => {
    const s = await setup();
    const { body } = await create(s.owner.token, order(s));
    const taskId = body.ids[0];
    const recordId = await close(s, taskId, "application", {
      products: [{ productId: s.productId, name: "Glifosato", dose: 2, unit: "l_ha" }],
      areaHa: 8, // se hicieron 8 de las 10 ha previstas
    });
    const costs = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    const byCat = Object.fromEntries(costs.map((c: any) => [c.category, c]));
    expect(byCat.input).toMatchObject({ amountPyg: 160_000, originId: recordId }); // 16 l a 10.000
    expect(byCat.contractor).toMatchObject({ amountPyg: 280_000, description: "Pulverizaciones Villalba", origin: "contractor", plotId: s.plotIds[0] });
    const row = (await list(s.owner.token))[0];
    expect(row).toMatchObject({ status: "done", plannedAreaHa: 10, actualAreaHa: 8, costPyg: 440_000 });
    // editar el registro (7 ha) reemplaza ambos costos, sin duplicar
    const again = rec(s.farmId, s.plotIds[0]!, "application", { products: [{ productId: s.productId, name: "Glifosato", dose: 2, unit: "l_ha" }], areaHa: 7, orderTaskId: taskId });
    await push(s.worker.token, [{ ...again, row: { ...again.row, id: recordId } }]);
    expect((await list(s.owner.token))[0].costPyg).toBe(140_000 + 245_000);
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toHaveLength(2);
    // borrar el registro revierte consumo y contratista
    await push(s.owner.token, [{ mutationId: newId(), kind: "records.delete", row: { id: recordId } }]);
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toHaveLength(0);
  });

  it("con la cantidad real usada (usedQty) el stock baja por lo gastado, no por dosis x superficie", async () => {
    const s = await setup();
    const { body } = await create(s.owner.token, order(s));
    await close(s, body.ids[0], "application", {
      products: [{ productId: s.productId, name: "Glifosato", dose: 2, unit: "l_ha", usedQty: 18 }],
      areaHa: 8, // 16 l según la dosis, pero se gastaron 18
    });
    const costs = (await erpGet<any>(s.owner.token, "costs")).body.rows;
    expect(costs.find((c: any) => c.category === "input")).toMatchObject({ amountPyg: 180_000 });
  });

  it("cosecha con contratista por tonelada; la tarifa en dólares se convierte con el tipo de cambio", async () => {
    const s = await setup();
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7300 } });
    const c = await erpPost(s.owner.token, "contractors", { name: "Cosechas SA", service: "harvest", rateUnit: "ton", rateAmount: 500, currency: "USD" }); // US$ 5 por t
    const { body } = await create(s.owner.token, order(s, { order: { labor: "harvest", contractorId: c.body.id } }));
    await close(s, body.ids[0], "harvest", { tons: 40 });
    const cost = (await erpGet<any>(s.owner.token, "costs")).body.rows[0];
    expect(cost).toMatchObject({ category: "contractor", amount: 20_000, currency: "USD", amountPyg: 1_460_000 });
  });

  it("sin superficie en el registro usa la del lote; sin horas, el contratista por hora no carga costo", async () => {
    const s = await setup();
    const hourly = await erpPost(s.owner.token, "contractors", { name: "Fletes", service: "freight", rateUnit: "hour", rateAmount: 90_000, currency: "PYG" });
    const { body } = await create(s.owner.token, order(s, { order: { labor: "harvest", contractorId: hourly.body.id } }));
    await close(s, body.ids[0], "harvest", { tons: 10 });
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toHaveLength(0);
    const o2 = await create(s.owner.token, order(s, { order: { labor: "harvest", contractorId: hourly.body.id } }));
    await close(s, o2.body.ids[0], "harvest", { tons: 10, hours: 3 });
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows[0].amountPyg).toBe(270_000);
  });

  it("una orden de otra organización no genera costo", async () => {
    const s = await setup();
    const other = await setup();
    const { body } = await create(other.owner.token, order(other));
    await push(s.owner.token, [rec(s.farmId, s.plotIds[0]!, "application", { products: [{ productId: s.productId, name: "G", dose: 1, unit: "l_ha" }], areaHa: 1, orderTaskId: body.ids[0] })]);
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows.map((c: any) => c.category)).toEqual(["input"]);
  });
});
