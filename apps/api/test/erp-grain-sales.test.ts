/** E-34: venta de granos con contratos, entregas y liquidaciones (ingreso en cost_entries). */
import { describe, expect, it } from "vitest";
import { contractProgress, settlementNet } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

async function setup() {
  const s = await erpSetup();
  const buyer = await erpPost(s.owner.token, "parties", { name: "Acopiadora SA", kind: "customer" });
  const c = await erpPost(s.owner.token, "grain-contracts", { partyId: buyer.body.id, number: "C-1", crop: "soja", tons: 100, priceMinor: 2_500_000, currency: "PYG" });
  return { ...s, buyerId: buyer.body.id as string, contractId: c.body.id as string };
}
type S = Awaited<ReturnType<typeof setup>>;
const summary = async (s: S) => (await erpGet<any[]>(s.owner.token, "grain-contracts/summary")).body.find((c) => c.id === s.contractId);
const deliver = (s: S, tons: number, extra: Record<string, unknown> = {}) => erpPost(s.owner.token, "grain-deliveries", { contractId: s.contractId, date: "2026-11-05", tons, ...extra });
const settle = (s: S, tons: number, extra: Record<string, unknown> = {}) => erpPost(s.owner.token, "grain-settlements", { contractId: s.contractId, date: "2026-11-10", tons, ...extra });

describe("venta de granos (E-34)", () => {
  it("funciones puras: neto y avance del contrato", () => {
    expect(settlementNet(30, 2_500_000, 1_500_000)).toBe(73_500_000);
    expect(settlementNet(1, 100, 500)).toBe(0);
    expect(contractProgress(100, 60.0004, 30)).toEqual({ deliveredTons: 60, settledTons: 30, toDeliverTons: 40, toSettleTons: 30 });
    expect(contractProgress(100, 120, 0).toDeliverTons).toBe(0);
  });

  it("las entregas suman al avance del contrato con ticket, lote y humedad; borrarlas lo corrige", async () => {
    const s = await setup();
    const d1 = await deliver(s, 30, { ticket: "T-100", plotId: s.plotIds[0], moisturePct: 13.5, destination: "Silo Norte" });
    await deliver(s, 25.5);
    expect(d1.status).toBe(201);
    expect(await summary(s)).toMatchObject({ tons: 100, deliveredTons: 55.5, toDeliverTons: 44.5, settledTons: 0, toSettleTons: 55.5 });
    const list = (await erpGet<any[]>(s.owner.token, `grain-deliveries?contractId=${s.contractId}`)).body;
    expect(list.find((d) => d.ticket === "T-100")).toMatchObject({ plotId: s.plotIds[0], moisturePct: 13.5, destination: "Silo Norte" });
    await call("DELETE", `/org/erp/grain-deliveries/${d1.body.id}`, { token: s.owner.token });
    expect((await summary(s)).deliveredTons).toBe(25.5);
  });

  it("la entrega vive en las entregas a acopio de A-23: se ve en la estancia y las entregas sin contrato no suman al contrato", async () => {
    const s = await setup();
    const d = await deliver(s, 12.5, { ticket: "T-200", plotId: s.plotIds[0], destination: "Silo Sur", moisturePct: 14 });
    expect(d.status).toBe(201);
    // A-23: la misma fila aparece en la lista de la estancia con su silo y su neto en kilos
    const acopio = (await call<any>("GET", `/org/farms/${s.farmId}/deliveries`, { token: s.owner.token })).body;
    expect(acopio.rows).toHaveLength(1);
    expect(acopio.rows[0]).toMatchObject({ ticket: "T-200", silo: "Silo Sur", plotName: "Lote 1", netKg: 12_500, crop: "soja" });
    // una entrega a acopio sin contrato (A-23) no cuenta para el contrato ni sale en las entregas de contratos
    const plain = await call<any>("POST", `/org/farms/${s.farmId}/deliveries`, {
      token: s.owner.token,
      body: { crop: "soja", ticket: "0001", silo: "Silo Norte", deliveredOn: "2026-11-06", grossKg: 8000, moisturePct: 13, baseMoisturePct: 13, impuritiesPct: 0, otherKg: 0 },
    });
    expect(plain.status).toBe(201);
    expect((await call<any>("GET", `/org/farms/${s.farmId}/deliveries`, { token: s.owner.token })).body.rows).toHaveLength(2);
    expect((await summary(s)).deliveredTons).toBe(12.5);
    const list = (await erpGet<any[]>(s.owner.token, "grain-deliveries")).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: d.body.id, contractId: s.contractId, tons: 12.5, destination: "Silo Sur" });
    // borrar desde el contrato la saca de la estancia; las de A-23 sin contrato no se borran por acá
    expect((await call("DELETE", `/org/erp/grain-deliveries/${plain.body.id}`, { token: s.owner.token })).status).toBe(404);
    expect((await call("DELETE", `/org/erp/grain-deliveries/${d.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect((await call<any>("GET", `/org/farms/${s.farmId}/deliveries`, { token: s.owner.token })).body.rows).toHaveLength(1);
  });

  it("con varias estancias la entrega pide el lote o la estancia", async () => {
    const s = await setup();
    const other = await call<any>("POST", "/org/farms", {
      token: s.owner.token,
      body: { name: "Otra estancia", geometry: { type: "Polygon", coordinates: [[[-55.9, -27.2], [-55.88, -27.2], [-55.88, -27.18], [-55.9, -27.18], [-55.9, -27.2]]] } },
    });
    expect(other.status).toBe(201);
    expect((await deliver(s, 5)).status).toBe(400);
    expect((await deliver(s, 5, { farmId: s.farmId })).status).toBe(201);
    expect((await summary(s)).deliveredTons).toBe(5);
  });

  it("la liquidación calcula el neto, carga un ingreso con toneladas al lote y se borra con su ingreso", async () => {
    const s = await setup();
    await deliver(s, 40);
    const r = await settle(s, 40, { deductionsMinor: 2_000_000, plotId: s.plotIds[0], dueDate: "2026-12-10", number: "L-77" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ netAmount: 98_000_000, netPyg: 98_000_000 });
    const costs = (await erpGet<any>(s.owner.token, "costs")).body;
    expect(costs.rows).toHaveLength(1);
    expect(costs.rows[0]).toMatchObject({ category: "sale", amountPyg: 98_000_000, tons: 40, plotId: s.plotIds[0], farmId: s.farmId, origin: "settlement", originId: r.body.id, partyId: s.buyerId, activity: "agricultura" });
    expect(costs.totals.incomePyg).toBe(98_000_000);
    expect(await summary(s)).toMatchObject({ settledTons: 40, toSettleTons: 0, settledAmount: 98_000_000 });
    const l = (await erpGet<any[]>(s.owner.token, "grain-settlements")).body;
    expect(l[0]).toMatchObject({ dueDate: "2026-12-10", paidAmount: 0, number: "L-77", priceMinor: 2_500_000 });
    // el margen por lote (E-31) ve la venta
    const res = (await erpGet<any>(s.owner.token, "results")).body;
    expect(res.byPlot.find((p: any) => p.plotId === s.plotIds[0]).incomePyg).toBe(98_000_000);
    await call("DELETE", `/org/erp/grain-settlements/${r.body.id}`, { token: s.owner.token });
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows).toEqual([]);
    expect((await summary(s)).settledTons).toBe(0);
  });

  it("precio propio de la liquidación y USD con tipo de cambio (sin tipo de cambio no se liquida)", async () => {
    const s = await setup();
    const usd = await erpPost(s.owner.token, "grain-contracts", { crop: "maiz", tons: 10, priceMinor: 20_000, currency: "USD" });
    const st = (extra: Record<string, unknown> = {}) => erpPost(s.owner.token, "grain-settlements", { contractId: usd.body.id, date: "2026-11-10", tons: 10, ...extra });
    expect((await st()).status).toBe(400);
    await call("PUT", "/org/erp/exchange-rates/2026-11-01", { token: s.owner.token, body: { usdToPyg: 7000 } });
    const r = await st({ priceMinor: 21_000 });
    expect(r.body).toMatchObject({ netAmount: 210_000, netPyg: 14_700_000 });
    expect((await settle(s, 1, { priceMinor: 100, deductionsMinor: 500 })).status).toBe(400);
  });

  it("valida: comprador, campaña, lote y contrato de la organización; toneladas y precio", async () => {
    const s = await setup();
    const other = await setup();
    expect((await erpPost(s.owner.token, "grain-contracts", { partyId: other.buyerId, crop: "soja", tons: 1, priceMinor: 1, currency: "PYG" })).status).toBe(404);
    expect((await erpPost(s.owner.token, "grain-contracts", { crop: "soja", tons: 0, priceMinor: 1, currency: "PYG" })).status).toBe(400);
    expect((await erpPost(s.owner.token, "grain-contracts", { crop: "soja", tons: 1, priceMinor: 0, currency: "PYG" })).status).toBe(400);
    expect((await erpPost(s.owner.token, "grain-deliveries", { contractId: other.contractId, date: "2026-11-05", tons: 1 })).status).toBe(404);
    expect((await deliver(s, 1, { plotId: other.plotIds[0] })).status).toBe(404);
    expect((await settle(s, 1, { plotId: other.plotIds[0] })).status).toBe(404);
    expect((await deliver(s, -1)).status).toBe(400);
  });

  it("permisos: son montos, solo dueño y administrador (el agrónomo y el empleado, no)", async () => {
    const s = await setup();
    expect((await erpPost(s.admin.token, "grain-deliveries", { contractId: s.contractId, date: "2026-11-05", tons: 1 })).status).toBe(201);
    for (const who of [s.agro, s.worker]) {
      for (const p of ["grain-contracts", "grain-contracts/summary", "grain-deliveries", "grain-settlements"]) expect((await erpGet(who.token, p)).status).toBe(403);
      expect((await erpPost(who.token, "grain-contracts", { crop: "soja", tons: 1, priceMinor: 1, currency: "PYG" })).status).toBe(403);
      expect((await erpPost(who.token, "grain-settlements", { contractId: s.contractId, date: "2026-11-10", tons: 1 })).status).toBe(403);
      expect((await call("DELETE", "/org/erp/grain-settlements/x", { token: who.token })).status).toBe(403);
    }
  });
});
