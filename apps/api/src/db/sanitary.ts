/**
 * Calendario sanitario (G-10). Los eventos son de la organización y solo se ven en la web; al crearlos se generan
 * tareas (kind "health") para los empleados asignados a algún potrero, que sí bajan al celular.
 * El estado hecho o vencido se calcula contra los registros `health` (sanitaryState en packages/shared).
 */
import { and, asc, eq, getTableColumns, gte, isNull, sql } from "drizzle-orm";
import {
  HEALTH_REASONS,
  newId,
  sanitaryState,
  matchingHealth,
  SANITARY_EARLY_DAYS,
  t,
  type HealthRecordLite,
  type SanitaryEventInput,
  type SanitaryState,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, chunkForParams, currentVersion, runBatch, type Stmt } from "./client";
import { can, NotFoundError, type ScopedDb } from "./scoped";

/** Tope de tareas creadas por evento (presupuesto de queries del plan gratis). */
const MAX_TASKS_PER_EVENT = 100;

export interface SanitaryEventRow {
  id: string;
  farmId: string | null;
  reason: (typeof HEALTH_REASONS)[number];
  plannedDate: string;
  categories: string[];
  product: string | null;
  note: string | null;
  tasksCreated: number;
  state: SanitaryState;
  /** Cuándo se cargó el registro que lo cumplió. */
  doneAt: number | null;
}

const monthEnd = (month: string) => `${month}-31`;

export async function listSanitaryEvents(sdb: ScopedDb, month: string, farmId?: string): Promise<SanitaryEventRow[]> {
  sdb.require(can.viewAll);
  const org = sdb.auth.orgId;
  const events = await sdb.db
    .select()
    .from(s.sanitaryEvents)
    .where(
      and(
        eq(s.sanitaryEvents.organizationId, org),
        isNull(s.sanitaryEvents.deletedAt),
        gte(s.sanitaryEvents.plannedDate, `${month}-01`),
        sql`${s.sanitaryEvents.plannedDate} <= ${monthEnd(month)}`,
        farmId ? sql`(${s.sanitaryEvents.farmId} IS NULL OR ${s.sanitaryEvents.farmId} = ${farmId})` : undefined,
      ),
    )
    .orderBy(asc(s.sanitaryEvents.plannedDate), asc(s.sanitaryEvents.id));
  if (!events.length) return [];
  const from = Date.parse(`${events[0]!.plannedDate}T00:00:00-03:00`) - SANITARY_EARLY_DAYS * 86_400_000;
  const reason = sql<string>`json_extract(${s.records.data}, '$.reason')`;
  const health: HealthRecordLite[] = await sdb.db
    .select({ farmId: s.records.farmId, capturedAt: s.records.capturedAt, reason })
    .from(s.records)
    .where(
      and(
        eq(s.records.organizationId, org),
        eq(s.records.kind, "health"),
        isNull(s.records.deletedAt),
        gte(s.records.capturedAt, from),
      ),
    )
    .limit(3000);
  const today = new Date(sdb.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  return events.map((e) => {
    const lite = { reason: e.reason, plannedDate: e.plannedDate, farmId: e.farmId };
    const hit = matchingHealth(lite, health);
    return {
      id: e.id,
      farmId: e.farmId,
      reason: e.reason,
      plannedDate: e.plannedDate,
      categories: JSON.parse(e.categories) as string[],
      product: e.product,
      note: e.note,
      tasksCreated: e.tasksCreated,
      state: sanitaryState(lite, health, today),
      doneAt: hit?.capturedAt ?? null,
    };
  });
}

export async function createSanitaryEvent(sdb: ScopedDb, input: SanitaryEventInput) {
  sdb.require(can.planSanitary, "No tenés permiso para planificar el calendario sanitario");
  const org = sdb.auth.orgId;
  if (input.farmId) await sdb.requireFarm(input.farmId);
  const ts = sdb.now();
  const id = newId();
  let workers: { userId: string; farmId: string }[] = [];
  if (input.createTasks) {
    // Un empleado por estancia en la que tiene potreros asignados.
    workers = await sdb.db
      .selectDistinct({ userId: s.plotAssignments.userId, farmId: s.plots.farmId })
      .from(s.plotAssignments)
      .innerJoin(s.plots, eq(s.plots.id, s.plotAssignments.plotId))
      .innerJoin(
        s.memberships,
        and(eq(s.memberships.userId, s.plotAssignments.userId), eq(s.memberships.organizationId, org)),
      )
      .where(
        and(
          eq(s.plotAssignments.organizationId, org),
          isNull(s.plotAssignments.deletedAt),
          isNull(s.plots.deletedAt),
          eq(s.plots.kind, "pasture"),
          eq(s.memberships.role, "worker"),
          eq(s.memberships.status, "active"),
          isNull(s.memberships.deletedAt),
          input.farmId ? eq(s.plots.farmId, input.farmId) : undefined,
        ),
      )
      .limit(MAX_TASKS_PER_EVENT);
  }
  const label = t(`fields.healthReason_${input.reason}`);
  const title = input.product ? `${label}: ${input.product}` : label;
  // bumpVersion primero, solo si hay tareas (el evento no se sincroniza, las tareas sí).
  const stmts: Stmt[] = [
    ...(workers.length ? [bumpVersion(sdb.db)] : []),
    sdb.db.insert(s.sanitaryEvents).values({
      id,
      organizationId: org,
      farmId: input.farmId ?? null,
      reason: input.reason,
      plannedDate: input.plannedDate,
      categories: JSON.stringify(input.categories),
      product: input.product ?? null,
      note: input.note ?? null,
      tasksCreated: workers.length,
      createdBy: sdb.auth.userId,
      createdAt: ts,
      updatedAt: ts,
    }),
  ];
  const perRow = Object.keys(getTableColumns(s.tasks)).length;
  for (const chunk of chunkForParams(workers, perRow)) {
    stmts.push(
      sdb.db.insert(s.tasks).values(
        chunk.map((w) => ({
          id: newId(),
          organizationId: org,
          farmId: w.farmId,
          plotId: null,
          assigneeId: w.userId,
          title,
          kind: "health" as const,
          dueDate: input.plannedDate,
          recurrence: "none" as const,
          status: "open" as const,
          createdBy: sdb.auth.userId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        })),
      ),
    );
  }
  await runBatch(sdb.db, stmts);
  return { id, tasksCreated: workers.length };
}

export async function deleteSanitaryEvent(sdb: ScopedDb, id: string) {
  sdb.require(can.planSanitary, "No tenés permiso para planificar el calendario sanitario");
  const ts = sdb.now();
  const res = await sdb.db
    .update(s.sanitaryEvents)
    .set({ deletedAt: ts, updatedAt: ts })
    .where(
      and(
        eq(s.sanitaryEvents.id, id),
        eq(s.sanitaryEvents.organizationId, sdb.auth.orgId),
        isNull(s.sanitaryEvents.deletedAt),
      ),
    )
    .returning({ id: s.sanitaryEvents.id });
  if (!res.length) throw new NotFoundError("Evento inexistente");
}
