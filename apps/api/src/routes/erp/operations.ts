/** Exportación, órdenes de trabajo, mantenimiento, labor y personal. */
import { z } from "zod";
import { LIMITS } from "@yvy/shared";
import { attendanceDayInput, employeePaymentInput, employeeInput, machineCostInput, maintenanceLogInput, maintenancePlanInput, orderSchema, documentTaxInput, EXPORT_DATASETS, exportFormatInput, isoDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { results } from "../../db/results";
import { createWorkOrder, listWorkOrders } from "../../db/work-orders";
import { deleteMachineCost, laborComparison, listMachineCosts, saveMachineCost } from "../../db/labor-cost";
import { attendanceSummary, deleteAttendance, listAttendance, markDay } from "../../db/attendance";
import { balances, createPayment, deletePayment, employeeStatement, listPayments, payroll } from "../../db/employee-payments";
import { deleteDocumentTax, exportRows, saveDocumentTax } from "../../db/export-docs";
import { createLog, deleteLog, duePlans, listLogs } from "../../db/maintenance";
import { erpCreate, erpDelete, erpList, erpUpdate, requireOwned } from "../../db/erp";
import { can } from "../../db/scoped";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { master } from "./master";
import { uuid } from "../schemas";
import { Hono } from "hono";

export const routes = new Hono<AppEnv>();

// ---------- Exportación para sistemas contables (I-06) ----------

routes.get("/export/rows", async (c) => {
  const q = parse(z.object({ dataset: z.enum(EXPORT_DATASETS), from: isoDate, to: isoDate }), c.req.query());
  return c.json(await exportRows(c.var.sdb, q.dataset, q.from, q.to));
});
routes.put("/export/taxes", async (c) => c.json(await saveDocumentTax(c.var.sdb, parse(documentTaxInput, await readJson(c.req)))));
routes.delete("/export/taxes/:kind/:id", async (c) => {
  await deleteDocumentTax(c.var.sdb, parse(z.enum(["purchase", "settlement", "cattle"]), c.req.param("kind")), parse(uuid, c.req.param("id")));
  return c.json({ ok: true });
});
routes.get("/export/formats", async (c) => {
  const rows = await erpList(c.var.sdb, s.exportFormats, can.manageErp, [s.exportFormats.name]);
  return c.json(rows.map((r) => ({ ...(r as { id: string; name: string; dataset: string; config: string }), config: JSON.parse((r as { config: string }).config) })));
});
routes.post("/export/formats", async (c) => {
  const b = parse(exportFormatInput, await readJson(c.req));
  return c.json(await erpCreate(c.var.sdb, s.exportFormats, can.manageErp, { ...b, config: JSON.stringify(b.config) }), 201);
});
routes.put("/export/formats/:id", async (c) => {
  const b = parse(exportFormatInput, await readJson(c.req));
  await erpUpdate(c.var.sdb, s.exportFormats, can.manageErp, c.req.param("id"), { ...b, config: JSON.stringify(b.config) });
  return c.json({ ok: true });
});
routes.delete("/export/formats/:id", async (c) => {
  await erpDelete(c.var.sdb, s.exportFormats, can.manageErp, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Órdenes de trabajo (E-20) ----------
// Crear y ver: quien puede asignar tareas (no el empleado). El costo se ve solo con permiso de montos.

routes.get("/work-orders", async (c) =>
  c.json(
    await listWorkOrders(
      c.var.sdb,
      parse(z.object({ farmId: uuid.optional(), status: z.enum(["open", "done", "cancelled"]).optional() }), c.req.query()),
    ),
  ),
);
routes.post("/work-orders", async (c) => {
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

routes.get("/results", async (c) =>
  c.json(await results(c.var.sdb, parse(z.object({ farmId: uuid.optional(), seasonId: uuid.optional() }), c.req.query()))),
);

// ---------- Mantenimiento preventivo (E-22) ----------
// Planes y avisos: el agrónomo los ve (son horas y km). Servicios con costo: dueño y administrador.

master(routes, "maintenance-plans", s.maintenancePlans, maintenancePlanInput, [s.maintenancePlans.name], {
  read: can.viewStock,
  check: async (sdb, v) => {
    if (typeof v.machineId === "string") await requireOwned(sdb, s.machines, v.machineId, "La máquina");
  },
  normalize: (v) => (v.lastDoneMeter === null ? { ...v, lastDoneMeter: 0 } : v),
});
routes.get("/maintenance/due", async (c) => c.json(await duePlans(c.var.sdb, c.req.query("all") === "1")));
routes.get("/maintenance/logs", async (c) =>
  c.json(await listLogs(c.var.sdb, parse(uuid.optional(), c.req.query("machineId")))),
);
routes.post("/maintenance/logs", async (c) => c.json(await createLog(c.var.sdb, parse(maintenanceLogInput, await readJson(c.req))), 201));
routes.delete("/maintenance/logs/:id", async (c) => {
  await deleteLog(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Labor propia frente a contratista (E-23) ----------
// Son montos: solo dueño y administrador.

routes.get("/machine-costs", async (c) => c.json(await listMachineCosts(c.var.sdb)));
routes.put("/machine-costs/:machineId", async (c) => {
  await saveMachineCost(c.var.sdb, parse(uuid, c.req.param("machineId")), parse(machineCostInput, await readJson(c.req)));
  return c.json({ ok: true });
});
routes.delete("/machine-costs/:machineId", async (c) => {
  await deleteMachineCost(c.var.sdb, parse(uuid, c.req.param("machineId")));
  return c.json({ ok: true });
});
routes.get("/labor-cost", async (c) => c.json(await laborComparison(c.var.sdb)));

// ---------- Personal y asistencia (E-25) ----------
// Jornales son montos: solo dueño y administrador.

master(routes, "employees", s.employees, employeeInput, [s.employees.name]);
routes.get("/attendance", async (c) =>
  c.json(await listAttendance(c.var.sdb, parse(z.object({ employeeId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);
routes.get("/attendance/summary", async (c) =>
  c.json(await attendanceSummary(c.var.sdb, parse(z.object({ from: isoDate.optional(), to: isoDate.optional() }), c.req.query()))),
);
routes.post("/attendance", async (c) => {
  const b = parse(attendanceDayInput, await readJson(c.req));
  return c.json(await markDay(c.var.sdb, b.date, b.entries), 201);
});
routes.delete("/attendance/:id", async (c) => {
  await deleteAttendance(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- Adelantos, pagos y saldo por empleado (E-26) ----------

routes.get("/employee-payments", async (c) => c.json(await listPayments(c.var.sdb, parse(uuid.optional(), c.req.query("employeeId")))));
routes.post("/employee-payments", async (c) => c.json(await createPayment(c.var.sdb, parse(employeePaymentInput, await readJson(c.req))), 201));
routes.delete("/employee-payments/:id", async (c) => {
  await deletePayment(c.var.sdb, c.req.param("id"));
  return c.json({ ok: true });
});
routes.get("/employees/balance", async (c) => c.json(await balances(c.var.sdb, parse(isoDate.optional(), c.req.query("to")))));
routes.get("/employees/payroll", async (c) => {
  const q = parse(z.object({ from: isoDate, to: isoDate }), c.req.query());
  return c.json(await payroll(c.var.sdb, q.from, q.to));
});
routes.get("/employees/:id/statement", async (c) => c.json(await employeeStatement(c.var.sdb, parse(uuid, c.req.param("id")))));
