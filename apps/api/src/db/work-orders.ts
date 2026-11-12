/**
 * Órdenes de trabajo (E-20): una tarea por lote con un payload `workOrder` (labor, insumos, máquina, contratista).
 * Es una tarea común: baja al celular del operario, que la cierra con un registro de campo (E-21).
 * Lo que pasa al cerrarla (consumo de insumos, costo del contratista) lo hace erp-effects.ts al llegar el registro.
 */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { LIMITS, ORDER_LABOR_KIND, t, type WorkOrder } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams } from "./client";
import { requireOwned } from "./erp";
import { can, type ScopedDb } from "./scoped";

export interface WorkOrderInput {
  farmId: string;
  plotIds: string[];
  assigneeId: string;
  dueDate: string;
  title?: string | null;
  order: WorkOrder;
}

export async function createWorkOrder(sdb: ScopedDb, input: WorkOrderInput) {
  sdb.require(can.assign);
  const plotIds = [...new Set(input.plotIds)];
  if (!plotIds.length || plotIds.length > LIMITS.erp.maxPlotsPerOrder)
    throw new HTTPException(400, { message: `Elegí entre 1 y ${LIMITS.erp.maxPlotsPerOrder} lotes` });
  const order = { ...input.order };
  for (const p of order.products) if (p.productId) await requireOwned(sdb, s.products, p.productId, "El producto");
  if (order.seasonId) await requireOwned(sdb, s.seasons, order.seasonId, "La campaña");
  if (order.contractorId) await requireOwned(sdb, s.contractors, order.contractorId, "El contratista");
  if (order.machineId) {
    await requireOwned(sdb, s.machines, order.machineId, "La máquina");
    const [m] = await sdb.db.select({ name: s.machines.name }).from(s.machines).where(eq(s.machines.id, order.machineId)).limit(1);
    if (m) order.machine = m.name;
  }
  const kind = ORDER_LABOR_KIND[order.labor];
  // La aplicación sigue usando la receta (A-11) para precargar la pantalla del celular.
  const prescription =
    order.labor === "spraying" && order.products.length
      ? JSON.stringify({ seasonId: order.seasonId, products: order.products, volumeLHa: order.volumeLHa, note: order.note })
      : null;
  return sdb.createTasks({
    farmId: input.farmId,
    plotIds,
    assigneeId: input.assigneeId,
    title: input.title?.trim() || t(`ui.orderLabor_${order.labor}`),
    kind,
    dueDate: input.dueDate,
    recurrence: "none",
    prescription,
    workOrder: JSON.stringify(order),
  });
}

/** Órdenes de trabajo con lo previsto y lo real (superficie del registro con que se cerró) y, con permiso, el costo. */
export async function listWorkOrders(sdb: ScopedDb, f: { farmId?: string; status?: "open" | "done" | "cancelled" }) {
  sdb.require(can.assign);
  const org = sdb.auth.orgId;
  const tasks = await sdb.db
    .select({
      id: s.tasks.id,
      title: s.tasks.title,
      farmId: s.tasks.farmId,
      plotId: s.tasks.plotId,
      plotName: s.plots.name,
      plotAreaHa: s.plots.areaHa,
      assigneeId: s.tasks.assigneeId,
      assigneeName: s.users.fullName,
      dueDate: s.tasks.dueDate,
      status: s.tasks.status,
      completedAt: s.tasks.completedAt,
      recordId: s.tasks.recordId,
      workOrder: s.tasks.workOrder,
    })
    .from(s.tasks)
    .leftJoin(s.plots, eq(s.plots.id, s.tasks.plotId))
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .where(
      and(
        eq(s.tasks.organizationId, org),
        isNull(s.tasks.deletedAt),
        isNotNull(s.tasks.workOrder),
        f.farmId ? eq(s.tasks.farmId, f.farmId) : undefined,
        f.status ? eq(s.tasks.status, f.status) : undefined,
      ),
    )
    .orderBy(desc(s.tasks.dueDate), desc(s.tasks.createdAt))
    .limit(LIMITS.erp.listLimit);
  const recordIds = tasks.flatMap((x) => (x.recordId ? [x.recordId] : []));
  const [records, costs] = await Promise.all([
    Promise.all(
      chunkForParams(recordIds, 2).map((chunk) =>
        sdb.db
          .select({
            id: s.records.id,
            areaHa: sql<number | null>`json_extract(${s.records.data}, '$.areaHa')`,
            tons: sql<number | null>`json_extract(${s.records.data}, '$.tons')`,
          })
          .from(s.records)
          .where(and(eq(s.records.organizationId, org), inArray(s.records.id, chunk))),
      ),
    ).then((r) => r.flat()),
    can.manageErp(sdb.auth.role)
      ? Promise.all(
          chunkForParams(recordIds, 2).map((chunk) =>
            sdb.db
              .select({ originId: s.costEntries.originId, costPyg: sql<number>`SUM(${s.costEntries.amountPyg})` })
              .from(s.costEntries)
              .where(and(eq(s.costEntries.organizationId, org), isNull(s.costEntries.deletedAt), inArray(s.costEntries.originId, chunk)))
              .groupBy(s.costEntries.originId),
          ),
        ).then((r) => r.flat())
      : Promise.resolve(null),
  ]);
  const rec = new Map(records.map((r) => [r.id, r]));
  const cost = costs ? new Map(costs.map((c) => [c.originId, c.costPyg])) : null;
  return tasks.map(({ workOrder, plotAreaHa, ...x }) => {
    const order = JSON.parse(workOrder as string) as WorkOrder;
    const r = x.recordId ? rec.get(x.recordId) : undefined;
    return {
      ...x,
      order,
      plannedAreaHa: order.areaHa ?? plotAreaHa ?? null,
      actualAreaHa: r?.areaHa ?? null,
      actualTons: r?.tons ?? null,
      ...(cost ? { costPyg: x.recordId ? (cost.get(x.recordId) ?? 0) : 0 } : {}),
    };
  });
}
