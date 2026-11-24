/**
 * Rutas del ERP: presupuesto, compras, venta de granos, hacienda, caja y bancos, y exportación al contador.
 */
import { z } from "zod";
import { accountMapInput, cashAccountInput, cashMoveInput, cashTransferInput, settleInput, CATTLE_DEAL_KINDS, cattleDealInput, grainContractInput, grainDeliveryInput, grainSettlementInput, purchaseInput, purchaseInvoiceInput, purchaseReceiveInput, budgetLineInput, isoDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { budgetCompare } from "../../db/budget";
import { createPurchase, deletePurchase, getPurchase, invoicePurchase, listPurchases, receivePurchase, revertReception } from "../../db/purchases";
import { checkContractRefs, contractsSummary, createDelivery, createSettlement, deleteDelivery, deleteSettlement, listDeliveries, listSettlements } from "../../db/grain-sales";
import { createDeal, deleteDeal, listDeals } from "../../db/cattle-deals";
import { accountBalances, createMove as createCashMove, deleteMove as deleteCashMove, dues, listMoves as listCashMoves, requireAccountUnused, settle, transfer } from "../../db/cash";
import { accountantExport, listMap, resetMap, saveMap } from "../../db/accountant";
import { requireOwned } from "../../db/erp";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { master } from "./master";
import { uuid } from "../schemas";
import { Hono } from "hono";

/** Rutas de presupuesto, compras, granos, hacienda, caja y contador. */
export const routes = new Hono<AppEnv>();

// ---------- Presupuesto de campaña ----------

master(routes, "budget-lines", s.budgetLines, budgetLineInput, [s.budgetLines.category], {
  normalize: (v) => (typeof v.plotId === "string" ? { ...v, crop: null } : typeof v.crop === "string" ? { ...v, plotId: null } : v),
  check: async (sdb, v) => {
    if (typeof v.seasonId === "string") await requireOwned(sdb, s.seasons, v.seasonId, "La campaña");
    if (typeof v.plotId === "string") await requireOwned(sdb, s.plots, v.plotId, "El lote");
  },
});
routes.get("/budget/compare", async (c) => c.json(await budgetCompare(c.var.sdb, parse(uuid, c.req.query("seasonId")))));

// ---------- Compras: orden, factura y recepción ----------

routes.get("/purchases", async (c) => c.json(await listPurchases(c.var.sdb, { status: c.req.query("status") })));
routes.post("/purchases", async (c) => c.json(await createPurchase(c.var.sdb, parse(purchaseInput, await readJson(c.req))), 201));
routes.get("/purchases/:id", async (c) => c.json(await getPurchase(c.var.sdb, parse(uuid, c.req.param("id")))));
routes.post("/purchases/:id/invoice", async (c) => {
  await invoicePurchase(c.var.sdb, parse(uuid, c.req.param("id")), parse(purchaseInvoiceInput, await readJson(c.req)));
  return c.json({ ok: true });
});
routes.post("/purchases/:id/receive", async (c) =>
  c.json(await receivePurchase(c.var.sdb, parse(uuid, c.req.param("id")), parse(purchaseReceiveInput, await readJson(c.req)))),
);
routes.delete("/purchases/:id/reception", async (c) => {
  await revertReception(c.var.sdb, parse(uuid, c.req.param("id")));
  return c.json({ ok: true });
});
routes.delete("/purchases/:id", async (c) => {
  await deletePurchase(c.var.sdb, parse(uuid, c.req.param("id")));
  return c.json({ ok: true });
});

// ---------- Venta de granos ----------

master(routes, "grain-contracts", s.grainContracts, grainContractInput, [s.grainContracts.createdAt], {
  check: (sdb, v) => checkContractRefs(sdb, v),
});
routes.get("/grain-contracts/summary", async (c) => c.json(await contractsSummary(c.var.sdb)));
routes.get("/grain-deliveries", async (c) => c.json(await listDeliveries(c.var.sdb, parse(uuid.optional(), c.req.query("contractId")))));
routes.post("/grain-deliveries", async (c) => c.json(await createDelivery(c.var.sdb, parse(grainDeliveryInput, await readJson(c.req))), 201));
routes.delete("/grain-deliveries/:id", async (c) => {
  await deleteDelivery(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
routes.get("/grain-settlements", async (c) => c.json(await listSettlements(c.var.sdb, parse(uuid.optional(), c.req.query("contractId")))));
routes.post("/grain-settlements", async (c) => c.json(await createSettlement(c.var.sdb, parse(grainSettlementInput, await readJson(c.req))), 201));
routes.delete("/grain-settlements/:id", async (c) => {
  await deleteSettlement(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Compras y ventas de hacienda ----------

routes.get("/cattle-deals", async (c) => c.json(await listDeals(c.var.sdb, parse(z.enum(CATTLE_DEAL_KINDS).optional(), c.req.query("kind")))));
routes.post("/cattle-deals", async (c) => c.json(await createDeal(c.var.sdb, parse(cattleDealInput, await readJson(c.req))), 201));
routes.delete("/cattle-deals/:id", async (c) => {
  await deleteDeal(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Caja y bancos, cuentas a pagar y a cobrar ----------

master(routes, "cash-accounts", s.cashAccounts, cashAccountInput, [s.cashAccounts.name], {
  normalize: (v) => (v.openingBalance === null ? { ...v, openingBalance: 0 } : v),
  beforeDelete: requireAccountUnused,
});
routes.get("/cash/balances", async (c) => c.json(await accountBalances(c.var.sdb)));
routes.get("/cash/moves", async (c) => c.json(await listCashMoves(c.var.sdb, parse(uuid.optional(), c.req.query("accountId")))));
routes.post("/cash/moves", async (c) => c.json(await createCashMove(c.var.sdb, parse(cashMoveInput, await readJson(c.req))), 201));
routes.post("/cash/transfers", async (c) => c.json(await transfer(c.var.sdb, parse(cashTransferInput, await readJson(c.req))), 201));
routes.post("/cash/settle", async (c) => c.json(await settle(c.var.sdb, parse(settleInput, await readJson(c.req))), 201));
routes.delete("/cash/moves/:id", async (c) => {
  await deleteCashMove(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
routes.get("/payables", async (c) => c.json(await dues(c.var.sdb, "payable")));
routes.get("/receivables", async (c) => c.json(await dues(c.var.sdb, "receivable")));

// ---------- Exportación al contador ----------

routes.get("/accountant/map", async (c) => c.json(await listMap(c.var.sdb)));
routes.put("/accountant/map/:key", async (c) => {
  await saveMap(c.var.sdb, c.req.param("key"), parse(accountMapInput, await readJson(c.req)));
  return c.json({ ok: true });
});
routes.delete("/accountant/map/:key", async (c) => {
  await resetMap(c.var.sdb, c.req.param("key"));
  return c.json({ ok: true });
});
routes.get("/accountant/export", async (c) =>
  c.json(await accountantExport(c.var.sdb, parse(z.object({ from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);
