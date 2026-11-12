/** I-06: exportación para sistemas contables locales: filas de compras, ventas y caja, datos de IVA y formatos guardados. */
import { describe, expect, it } from "vitest";
import { defaultExportConfig, libroIvaConfig, renderExport, type ExportDoc } from "@yvy/shared";
import { newId } from "@yvy/shared";
import { call } from "./helpers";
import { erpGet, erpPost, erpSetup } from "./erp-helpers";

const putTax = (token: string, body: unknown) => call("PUT", "/org/erp/export/taxes", { token, body });
const rows = (token: string, dataset: string, from = "2026-11-01", to = "2026-11-30") => erpGet<any>(token, `export/rows?dataset=${dataset}&from=${from}&to=${to}`);

async function setup() {
  const s = await erpSetup();
  const supplier = await erpPost(s.owner.token, "parties", { name: "Agro SA", ruc: "80012345-6", kind: "supplier" });
  const o = await erpPost(s.owner.token, "purchases", { partyId: supplier.body.id, orderDate: "2026-11-01", currency: "PYG", lines: [{ description: "Flete", qty: 1, unitPrice: 1_650_000 }] });
  await erpPost(s.owner.token, `purchases/${o.body.id}/invoice`, { invoiceNumber: "001-001-0001234", invoiceDate: "2026-11-02", dueDate: "2026-12-02" });
  return { ...s, purchaseId: o.body.id as string, supplierId: supplier.body.id as string };
}

describe("exportación para sistemas contables (I-06)", () => {
  it("compras: facturas con RUC y número; el desglose de IVA se carga por documento y entra al libro IVA", async () => {
    const s = await setup();
    let r = (await rows(s.owner.token, "purchases")).body;
    expect(r.truncated).toBe(false);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ docKind: "purchase", date: "2026-11-02", number: "001-001-0001234", party: "Agro SA", ruc: "80012345-6", amountPyg: 1_650_000, timbrado: null, gross10: null });
    expect((await putTax(s.owner.token, { docKind: "purchase", docId: s.purchaseId, timbrado: "12345678", gross10: 1_100_000, gross5: 420_000, exempt: 130_000 })).status).toBe(200);
    // se puede corregir (reemplaza)
    await putTax(s.owner.token, { docKind: "purchase", docId: s.purchaseId, timbrado: " 12345678 ", gross10: 1_100_000, gross5: 420_000, exempt: 130_000 });
    r = (await rows(s.owner.token, "purchases")).body;
    expect(r.rows[0]).toMatchObject({ timbrado: "12345678", gross10: 1_100_000, gross5: 420_000, exempt: 130_000 });
    const text = renderExport("purchases", r.rows as ExportDoc[], libroIvaConfig("purchases")).split("\r\n");
    expect(text[1]).toBe("02/11/2026;80012345-6;Agro SA;12345678;001-001-0001234;1100000;420000;130000;100000;20000;1650000");
    expect((await call("DELETE", `/org/erp/export/taxes/purchase/${s.purchaseId}`, { token: s.owner.token })).status).toBe(200);
    expect((await rows(s.owner.token, "purchases")).body.rows[0].gross10).toBeNull();
  });

  it("filtra por período y no trae lo de otra organización; las compras sin factura no entran", async () => {
    const s = await setup();
    const other = await setup();
    await erpPost(s.owner.token, "purchases", { orderDate: "2026-11-03", currency: "PYG", lines: [{ description: "Sin factura", qty: 1, unitPrice: 1000 }] });
    expect((await rows(s.owner.token, "purchases", "2026-12-01", "2026-12-31")).body.rows).toHaveLength(0);
    expect((await rows(s.owner.token, "purchases")).body.rows).toHaveLength(1);
    expect((await rows(other.owner.token, "purchases")).body.rows).toHaveLength(1);
    expect((await rows(s.owner.token, "purchases", "2026-12-01", "2026-11-01")).status).toBe(400);
    // el documento de otra organización no se puede tocar
    expect((await putTax(s.owner.token, { docKind: "purchase", docId: other.purchaseId, gross10: 1, gross5: 0, exempt: 0 })).status).toBe(404);
    expect((await putTax(s.owner.token, { docKind: "purchase", docId: newId(), gross10: 1, gross5: 0, exempt: 0 })).status).toBe(404);
  });

  it("ventas: liquidaciones de granos y ventas de hacienda con el comprador", async () => {
    const s = await erpSetup();
    const buyer = await erpPost(s.owner.token, "parties", { name: "Cargill", ruc: "80000002-2", kind: "customer" });
    const c = await erpPost(s.owner.token, "grain-contracts", { partyId: buyer.body.id, number: "C-1", crop: "soja", tons: 100, priceMinor: 2_500_000, currency: "PYG" });
    await erpPost(s.owner.token, "grain-settlements", { contractId: c.body.id, date: "2026-11-10", tons: 30, number: "LIQ-77" });
    await erpPost(s.owner.token, "cattle-deals", { kind: "sell", date: "2026-11-12", partyId: buyer.body.id, farmId: s.farmId, category: "novillo", heads: 20, totalKg: 9000, amount: 72_000_000, currency: "PYG", guideNumber: "G-1" });
    await erpPost(s.owner.token, "cattle-deals", { kind: "buy", date: "2026-11-12", partyId: buyer.body.id, farmId: s.farmId, category: "ternero", heads: 5, totalKg: 1000, amount: 8_000_000, currency: "PYG" });
    const r = (await rows(s.owner.token, "sales")).body.rows;
    expect(r.map((x: any) => [x.docKind, x.number, x.party, x.ruc])).toEqual([["settlement", "LIQ-77", "Cargill", "80000002-2"], ["cattle", "G-1", "Cargill", "80000002-2"]]);
    expect(r[0].concept).toBe("Venta de soja");
    const buys = (await rows(s.owner.token, "purchases")).body.rows;
    expect(buys.map((x: any) => x.docKind)).toEqual(["cattle"]);
  });

  it("caja: movimientos con la cuenta, la moneda y el tercero", async () => {
    const s = await erpSetup();
    const acc = await erpPost(s.owner.token, "cash-accounts", { name: "Caja Gs.", type: "cash", currency: "PYG", openingBalance: 0 });
    await erpPost(s.owner.token, "cash/moves", { accountId: acc.body.id, date: "2026-11-05", amount: -2_500_000, description: "Gastos varios" });
    await erpPost(s.owner.token, "cash/moves", { accountId: acc.body.id, date: "2026-11-06", amount: 900_000, description: "Cobro" });
    const r = (await rows(s.owner.token, "cash")).body.rows;
    expect(r.map((x: any) => [x.date, x.account, x.currency, x.amountMinor])).toEqual([["2026-11-05", "Caja Gs.", "PYG", -2_500_000], ["2026-11-06", "Caja Gs.", "PYG", 900_000]]);
  });

  it("formatos guardados: alta, cambio, baja y validación", async () => {
    const s = await erpSetup();
    const cfg = libroIvaConfig("purchases");
    const created = await erpPost(s.owner.token, "export/formats", { name: "Libro IVA compras", dataset: "purchases", config: cfg });
    expect(created.status).toBe(201);
    const list = (await erpGet<any[]>(s.owner.token, "export/formats")).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Libro IVA compras", dataset: "purchases" });
    expect(list[0].config.columns).toHaveLength(11);
    const edit = await call("PUT", `/org/erp/export/formats/${created.body.id}`, { token: s.owner.token, body: { name: "Compras", dataset: "purchases", config: { ...defaultExportConfig("purchases"), separator: "comma" } } });
    expect(edit.status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "export/formats")).body[0]).toMatchObject({ name: "Compras", config: { separator: "comma" } });
    expect((await erpPost(s.owner.token, "export/formats", { name: "X", dataset: "purchases", config: { ...cfg, columns: [] } })).status).toBe(400);
    expect((await erpPost(s.owner.token, "export/formats", { name: "X", dataset: "nada", config: cfg })).status).toBe(400);
    expect((await call("DELETE", `/org/erp/export/formats/${created.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any[]>(s.owner.token, "export/formats")).body).toHaveLength(0);
  });

  it("mismos permisos que los montos: dueño y administrador; agrónomo y empleado no", async () => {
    const s = await setup();
    for (const [token, status] of [[s.owner.token, 200], [s.admin.token, 200], [s.agro.token, 403], [s.worker.token, 403]] as const) {
      expect((await rows(token, "purchases")).status).toBe(status);
      expect((await rows(token, "cash")).status).toBe(status);
      expect((await erpGet(token, "export/formats")).status).toBe(status);
    }
    const body = { docKind: "purchase", docId: s.purchaseId, gross10: 1, gross5: 0, exempt: 0 };
    expect((await putTax(s.admin.token, body)).status).toBe(200);
    expect((await putTax(s.agro.token, body)).status).toBe(403);
    expect((await putTax(s.worker.token, body)).status).toBe(403);
    expect((await erpPost(s.agro.token, "export/formats", { name: "X", dataset: "cash", config: defaultExportConfig("cash") })).status).toBe(403);
  });
});
