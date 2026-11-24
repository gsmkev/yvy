/**
 * Rutas del ERP: maestros (proveedores, máquinas, contratistas), tipo de cambio, costos y depósitos.
 */
import { z } from "zod";
import { contractorInput, COST_CATEGORIES, costEntryInput, exchangeRateInput, isoDate, machineInput, partyInput, warehouseInput } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { fixDefaultWarehouse } from "../../db/stock";
import { requireWarehouseUnused } from "../../db/stock-moves";
import { createCost, deleteCost, listCosts, updateCost } from "../../db/costs";
import { deleteRate, listRates, requireOwned, saveRate } from "../../db/erp";
import { can } from "../../db/scoped";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { farmCheck, master } from "./master";
import { uuid } from "../schemas";
import { Hono } from "hono";

/** Rutas de maestros, tipo de cambio, costos y depósitos. */
export const routes = new Hono<AppEnv>();

master(routes, "parties", s.parties, partyInput, [s.parties.name]);

// El agrónomo ve las máquinas (para entender el combustible); solo dueño y administrador las editan.
master(routes, "machines", s.machines, machineInput, [s.machines.name], {
  read: can.viewStock,
  check: farmCheck,
  normalize: (v) => (v.meterValue === null ? { ...v, meterValue: 0 } : v),
});

// Las tarifas son montos: solo dueño y administrador (el agrónomo no ve montos).
master(routes, "contractors", s.contractors, contractorInput, [s.contractors.name], {
  check: async (sdb, v) => {
    if (typeof v.partyId === "string") await requireOwned(sdb, s.parties, v.partyId, "El proveedor");
  },
});

// ---------- Tipo de cambio ----------

routes.get("/exchange-rates", async (c) => c.json(await listRates(c.var.sdb)));
routes.put("/exchange-rates/:date", async (c) => {
  const date = parse(isoDate, c.req.param("date"));
  const b = parse(exchangeRateInput.pick({ usdToPyg: true }), await readJson(c.req));
  await saveRate(c.var.sdb, date, b.usdToPyg);
  return c.json({ ok: true });
});
routes.delete("/exchange-rates/:date", async (c) => {
  await deleteRate(c.var.sdb, parse(isoDate, c.req.param("date")));
  return c.json({ ok: true });
});

// ---------- Costos y ventas ----------

routes.get("/costs", async (c) => {
  const q = parse(
    z.object({
      farmId: uuid.optional(),
      plotId: uuid.optional(),
      seasonId: uuid.optional(),
      category: z.enum(COST_CATEGORIES).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
    c.req.query(),
  );
  return c.json(await listCosts(c.var.sdb, q));
});
routes.post("/costs", async (c) => c.json(await createCost(c.var.sdb, parse(costEntryInput, await readJson(c.req))), 201));
routes.patch("/costs/:id", async (c) => {
  await updateCost(c.var.sdb, c.req.param("id"), parse(costEntryInput.partial(), await readJson(c.req)));
  return c.json({ ok: true });
});
routes.delete("/costs/:id", async (c) => {
  await deleteCost(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Depósitos ----------

// El agrónomo ve los depósitos (para entender el stock); dueño y administrador los editan.
master(routes, "warehouses", s.warehouses, warehouseInput, [s.warehouses.name], {
  read: can.viewStock,
  check: farmCheck,
  after: fixDefaultWarehouse,
  beforeDelete: requireWarehouseUnused,
});
