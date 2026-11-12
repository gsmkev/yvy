/** ERP sencillo desde la web (ADR 0004). Montada en /org/erp. */
import { Hono } from "hono";
import { z } from "zod";
import { LIMITS } from "@yvy/shared";
import { attendanceDayInput, employeeInput, machineCostInput, maintenanceLogInput, maintenancePlanInput, orderSchema, contractorInput, COST_CATEGORIES, costEntryInput, exchangeRateInput, isoDate, machineInput, partyInput, stockAdjustmentInput, stockMinimumInput, stockConsumptionInput, stockPurchaseInput, stockTransferInput, warehouseInput, type Role } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { HTTPException } from "hono/http-exception";
import { PHOTO_KINDS, photoTarget, setPhotoPath, type PhotoKind } from "../db/erp-photos";
import { presign } from "../lib/r2";
import { results } from "../db/results";
import { fuelReport } from "../db/fuel";
import { createWorkOrder, listWorkOrders } from "../db/work-orders";
import { fixDefaultWarehouse } from "../db/stock";
import { adjustStock, consumeStock, deleteMove, expiringLots, listMoves, purchaseStock, requireWarehouseUnused, stockSummary, transferStock } from "../db/stock-moves";
import { deleteMachineCost, laborComparison, listMachineCosts, saveMachineCost } from "../db/labor-cost";
import { attendanceSummary, deleteAttendance, listAttendance, markDay } from "../db/attendance";
import { createLog, deleteLog, duePlans, listLogs } from "../db/maintenance";
import { deleteMinimum, listMinimums, lowStock, saveMinimum } from "../db/stock-minimums";
import { createCost, deleteCost, listCosts, updateCost } from "../db/costs";
import { deleteRate, erpCreate, erpDelete, erpList, erpUpdate, listRates, requireOwned, saveRate, type ErpTable } from "../db/erp";
import { can, type ScopedDb } from "../db/scoped";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

export const erp = new Hono<AppEnv>();

interface MasterOpts {
  read?: (r: Role) => boolean;
  write?: (r: Role) => boolean;
  /** Validación extra con acceso a la base (por ejemplo, que la estancia sea de la organización). */
  check?: (sdb: ScopedDb, values: Record<string, unknown>) => Promise<void>;
  /** Ajusta los valores antes de guardar (por ejemplo, un null que la columna no admite). */
  normalize?: (values: Record<string, unknown>) => Record<string, unknown>;
  /** Después de guardar (alta o cambio) con el id de la fila. */
  after?: (sdb: ScopedDb, id: string) => Promise<void>;
  /** Antes de borrar: puede rechazar el borrado. */
  beforeDelete?: (sdb: ScopedDb, id: string) => Promise<void>;
}

/** Alta, listado, cambio y baja de un maestro con su esquema Zod. */
function master(path: string, table: ErpTable, schema: z.ZodObject, order: ErpTable[keyof ErpTable][], o: MasterOpts = {}) {
  const read = o.read ?? can.manageErp;
  const write = o.write ?? can.manageErp;
  const cols = order as never as Parameters<typeof erpList>[3];
  erp.get(`/${path}`, async (c) => c.json(await erpList(c.var.sdb, table, read, cols)));
  erp.post(`/${path}`, async (c) => {
    const b = (o.normalize ?? ((v) => v))(parse(schema, await readJson(c.req)) as Record<string, unknown>);
    c.var.sdb.require(write);
    await o.check?.(c.var.sdb, b);
    const created = await erpCreate(c.var.sdb, table, write, b);
    await o.after?.(c.var.sdb, created.id);
    return c.json(created, 201);
  });
  erp.patch(`/${path}/:id`, async (c) => {
    const b = (o.normalize ?? ((v) => v))(parse(schema.partial(), await readJson(c.req)) as Record<string, unknown>);
    c.var.sdb.require(write);
    await o.check?.(c.var.sdb, b);
    await erpUpdate(c.var.sdb, table, write, c.req.param("id"), b);
    await o.after?.(c.var.sdb, c.req.param("id"));
    return c.json({ ok: true });
  });
  erp.delete(`/${path}/:id`, async (c) => {
    c.var.sdb.require(write);
    await o.beforeDelete?.(c.var.sdb, c.req.param("id"));
    await erpDelete(c.var.sdb, table, write, c.req.param("id"));
    return c.json({ ok: true });
  });
}

master("parties", s.parties, partyInput, [s.parties.name]);

/** La estancia de una máquina o un depósito tiene que ser de la organización. */
const farmCheck = async (sdb: ScopedDb, v: Record<string, unknown>) => {
  if (typeof v.farmId === "string") await sdb.requireFarm(v.farmId);
};

// El agrónomo ve las máquinas (para entender el combustible); solo dueño y administrador las editan.
master("machines", s.machines, machineInput, [s.machines.name], {
  read: can.viewStock,
  check: farmCheck,
  normalize: (v) => (v.meterValue === null ? { ...v, meterValue: 0 } : v),
});

// Las tarifas son montos: solo dueño y administrador (el agrónomo no ve montos).
master("contractors", s.contractors, contractorInput, [s.contractors.name], {
  check: async (sdb, v) => {
    if (typeof v.partyId === "string") await requireOwned(sdb, s.parties, v.partyId, "El proveedor");
  },
});

// ---------- Tipo de cambio (E-06) ----------

erp.get("/exchange-rates", async (c) => c.json(await listRates(c.var.sdb)));
erp.put("/exchange-rates/:date", async (c) => {
  const date = parse(isoDate, c.req.param("date"));
  const b = parse(exchangeRateInput.pick({ usdToPyg: true }), await readJson(c.req));
  await saveRate(c.var.sdb, date, b.usdToPyg);
  return c.json({ ok: true });
});
erp.delete("/exchange-rates/:date", async (c) => {
  await deleteRate(c.var.sdb, parse(isoDate, c.req.param("date")));
  return c.json({ ok: true });
});

// ---------- Costos y ventas (E-05) ----------

const uuid = z.string().uuid();
erp.get("/costs", async (c) => {
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
erp.post("/costs", async (c) => c.json(await createCost(c.var.sdb, parse(costEntryInput, await readJson(c.req))), 201));
erp.patch("/costs/:id", async (c) => {
  await updateCost(c.var.sdb, c.req.param("id"), parse(costEntryInput.partial(), await readJson(c.req)));
  return c.json({ ok: true });
});
erp.delete("/costs/:id", async (c) => {
  await deleteCost(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Depósitos (E-10) ----------

// El agrónomo ve los depósitos (para entender el stock); dueño y administrador los editan.
master("warehouses", s.warehouses, warehouseInput, [s.warehouses.name], {
  read: can.viewStock,
  check: farmCheck,
  after: fixDefaultWarehouse,
  beforeDelete: requireWarehouseUnused,
});

// ---------- Stock (E-11) ----------
// Ver cantidades: dueño, administrador y agrónomo (sin montos). Cargar o borrar movimientos: dueño y administrador.

erp.get("/stock", async (c) => c.json(await stockSummary(c.var.sdb)));
erp.get("/stock/expiring", async (c) => c.json(await expiringLots(c.var.sdb)));
erp.get("/stock/moves", async (c) =>
  c.json(await listMoves(c.var.sdb, parse(z.object({ productId: uuid.optional(), warehouseId: uuid.optional() }), c.req.query()))),
);
erp.get("/stock/low", async (c) => c.json(await lowStock(c.var.sdb)));
erp.get("/stock/minimums", async (c) => c.json(await listMinimums(c.var.sdb)));
erp.put("/stock/minimums", async (c) => {
  await saveMinimum(c.var.sdb, parse(stockMinimumInput, await readJson(c.req)));
  return c.json({ ok: true });
});
erp.delete("/stock/minimums/:id", async (c) => {
  await deleteMinimum(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
erp.post("/stock/purchases", async (c) =>
  c.json(await purchaseStock(c.var.sdb, parse(stockPurchaseInput, await readJson(c.req))), 201),
);
erp.post("/stock/consumptions", async (c) =>
  c.json(await consumeStock(c.var.sdb, parse(stockConsumptionInput, await readJson(c.req))), 201),
);
erp.post("/stock/transfers", async (c) =>
  c.json(await transferStock(c.var.sdb, parse(stockTransferInput, await readJson(c.req))), 201),
);
erp.post("/stock/adjustments", async (c) =>
  c.json(await adjustStock(c.var.sdb, parse(stockAdjustmentInput, await readJson(c.req))), 201),
);
erp.delete("/stock/moves/:id", async (c) => {
  await deleteMove(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Foto de la factura o el ticket (E-37) ----------

const photoKind = (v: string): PhotoKind => parse(z.enum(PHOTO_KINDS), v);

/** URL firmada para subir la foto (PUT directo a R2). */
erp.post("/photos/:kind/:id/upload-url", async (c) => {
  const { key } = await photoTarget(c.var.sdb, photoKind(c.req.param("kind")), c.req.param("id"));
  const ttl = LIMITS.photos.uploadUrlTtlSeconds;
  return c.json({ url: await presign(c.env, "PUT", key, ttl), expiresAt: Date.now() + ttl * 1000 });
});

/** Confirma la subida: verifica el objeto y su tamaño y recién entonces lo asocia al movimiento. */
erp.post("/photos/:kind/:id/uploaded", async (c) => {
  const kind = photoKind(c.req.param("kind"));
  const { key } = await photoTarget(c.var.sdb, kind, c.req.param("id"));
  const head = await c.env.MEDIA.head(key);
  if (!head) throw new HTTPException(409, { message: "La foto todavía no está en el almacenamiento" });
  if (head.size > LIMITS.photos.maxBytes) {
    await c.env.MEDIA.delete(key);
    throw new HTTPException(413, { message: "Foto demasiado grande" });
  }
  await setPhotoPath(c.var.sdb, kind, c.req.param("id"), key);
  return c.json({ ok: true });
});

erp.get("/photos/:kind/:id", async (c) => {
  const { photoPath } = await photoTarget(c.var.sdb, photoKind(c.req.param("kind")), c.req.param("id"));
  if (!photoPath) throw new HTTPException(404, { message: "No tiene foto" });
  return c.json({ url: await presign(c.env, "GET", photoPath, LIMITS.photos.downloadUrlTtlSeconds) });
});

erp.delete("/photos/:kind/:id", async (c) => {
  const kind = photoKind(c.req.param("kind"));
  const { key, photoPath } = await photoTarget(c.var.sdb, kind, c.req.param("id"));
  await setPhotoPath(c.var.sdb, kind, c.req.param("id"), null);
  if (photoPath) await c.env.MEDIA.delete(key);
  return c.json({ ok: true });
});

// ---------- Combustible (E-16) ----------

erp.get("/fuel/report", async (c) =>
  c.json(await fuelReport(c.var.sdb, parse(z.object({ farmId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);

// ---------- Órdenes de trabajo (E-20) ----------
// Crear y ver: quien puede asignar tareas (no el empleado). El costo se ve solo con permiso de montos.

erp.get("/work-orders", async (c) =>
  c.json(
    await listWorkOrders(
      c.var.sdb,
      parse(z.object({ farmId: uuid.optional(), status: z.enum(["open", "done", "cancelled"]).optional() }), c.req.query()),
    ),
  ),
);
erp.post("/work-orders", async (c) => {
  const b = parse(
    z.object({
      farmId: uuid,
      plotIds: z.array(uuid).min(1).max(LIMITS.erp.maxPlotsPerOrder),
      assigneeId: z.string().min(1),
      dueDate: isoDate,
      title: z.string().trim().max(200).nullish(),
      order: orderSchema,
    }),
    await readJson(c.req),
  );
  return c.json(await createWorkOrder(c.var.sdb, b), 201);
});

// ---------- Costo por hectárea y por tonelada, margen (E-30, E-31) ----------

erp.get("/results", async (c) =>
  c.json(await results(c.var.sdb, parse(z.object({ farmId: uuid.optional(), seasonId: uuid.optional() }), c.req.query()))),
);

// ---------- Mantenimiento preventivo (E-22) ----------
// Planes y avisos: el agrónomo los ve (son horas y km). Servicios con costo: dueño y administrador.

master("maintenance-plans", s.maintenancePlans, maintenancePlanInput, [s.maintenancePlans.name], {
  read: can.viewStock,
  check: async (sdb, v) => {
    if (typeof v.machineId === "string") await requireOwned(sdb, s.machines, v.machineId, "La máquina");
  },
  normalize: (v) => (v.lastDoneMeter === null ? { ...v, lastDoneMeter: 0 } : v),
});
erp.get("/maintenance/due", async (c) => c.json(await duePlans(c.var.sdb, c.req.query("all") === "1")));
erp.get("/maintenance/logs", async (c) =>
  c.json(await listLogs(c.var.sdb, parse(uuid.optional(), c.req.query("machineId")))),
);
erp.post("/maintenance/logs", async (c) => c.json(await createLog(c.var.sdb, parse(maintenanceLogInput, await readJson(c.req))), 201));
erp.delete("/maintenance/logs/:id", async (c) => {
  await deleteLog(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Labor propia frente a contratista (E-23) ----------
// Son montos: solo dueño y administrador.

erp.get("/machine-costs", async (c) => c.json(await listMachineCosts(c.var.sdb)));
erp.put("/machine-costs/:machineId", async (c) => {
  await saveMachineCost(c.var.sdb, parse(uuid, c.req.param("machineId")), parse(machineCostInput, await readJson(c.req)));
  return c.json({ ok: true });
});
erp.delete("/machine-costs/:machineId", async (c) => {
  await deleteMachineCost(c.var.sdb, parse(uuid, c.req.param("machineId")));
  return c.json({ ok: true });
});
erp.get("/labor-cost", async (c) => c.json(await laborComparison(c.var.sdb)));

// ---------- Personal y asistencia (E-25) ----------
// Jornales son montos: solo dueño y administrador.

master("employees", s.employees, employeeInput, [s.employees.name]);
erp.get("/attendance", async (c) =>
  c.json(await listAttendance(c.var.sdb, parse(z.object({ employeeId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);
erp.get("/attendance/summary", async (c) =>
  c.json(await attendanceSummary(c.var.sdb, parse(z.object({ from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);
erp.post("/attendance", async (c) => {
  const b = parse(attendanceDayInput, await readJson(c.req));
  return c.json(await markDay(c.var.sdb, b.date, b.entries), 201);
});
erp.delete("/attendance/:id", async (c) => {
  await deleteAttendance(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
