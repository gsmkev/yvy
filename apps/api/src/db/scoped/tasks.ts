/** Alta de tareas y prescripciones. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch } from "../client";
import type { ScopedDb } from "./index";
import { NotFoundError, can } from "./permissions";

/**
 * Receta → órdenes de trabajo: una tarea de aplicación por lote, para el mismo empleado, con la
 * receta adentro. 3 lecturas y un solo batch (una fila por lote, máx. 40).
 */
export async function createPrescription(sdb: ScopedDb, input: {
  farmId: string;
  plotIds: string[];
  assigneeId: string;
  title: string;
  dueDate: string;
  prescription: string;
}): Promise<{ ids: string[] }> {
  sdb.require(can.assign);
  await sdb.requireFarm(input.farmId, true);
  await sdb.memberRole(input.assigneeId);
  const plotIds = [...new Set(input.plotIds)];
  const found = await sdb.db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(
      and(
        eq(s.plots.organizationId, sdb.auth.orgId),
        eq(s.plots.farmId, input.farmId),
        inArray(s.plots.id, plotIds),
        isNull(s.plots.deletedAt),
      ),
    );
  if (found.length !== plotIds.length) throw new NotFoundError("Lote inexistente");
  const ts = sdb.now();
  const ids = plotIds.map(() => newId());
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...plotIds.map((plotId, i) =>
      sdb.db.insert(s.tasks).values({
        id: ids[i]!,
        organizationId: sdb.auth.orgId,
        farmId: input.farmId,
        plotId,
        assigneeId: input.assigneeId,
        title: input.title,
        kind: "application",
        dueDate: input.dueDate,
        recurrence: "none",
        prescription: input.prescription,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
    ),
    ...sdb.audit({
      action: "task_create",
      entity: "task",
      entityId: ids[0] ?? null,
      detail: { farmId: input.farmId, count: ids.length, assigneeId: input.assigneeId, title: input.title, prescription: true },
    }),
  ]);
  return { ids };
}

/** Crea una tarea de un lote (o sin lote si `plotId` es null) asignada a una persona. */
export async function createTask(sdb: ScopedDb, input: {
  farmId: string;
  plotId: string | null;
  assigneeId: string;
  title: string;
  kind: (typeof s.RECORD_KINDS)[number] | null;
  dueDate: string;
  dueTime?: string | null;
  priority?: (typeof s.TASK_PRIORITIES)[number];
  recurrence: (typeof s.RECURRENCES)[number];
  /** Lista de verificación en JSON. */
  checklist?: string | null;
  lon?: number | null;
  lat?: number | null;
  prescription?: string | null;
}) {
  const { ids } = await sdb.createTasks({ ...input, plotIds: [input.plotId] });
  return { id: ids[0]! };
}

/**
 * Una tarea por lote, todas en un mismo batch. `plotIds` con `null` crea una
 * tarea sin lote. Los lotes tienen que ser de la estancia y de la organización.
 */
export async function createTasks(sdb: ScopedDb, input: {
  farmId: string;
  plotIds: (string | null)[];
  assigneeId: string;
  title: string;
  kind: (typeof s.RECORD_KINDS)[number] | null;
  dueDate: string;
  dueTime?: string | null;
  priority?: (typeof s.TASK_PRIORITIES)[number];
  recurrence: (typeof s.RECURRENCES)[number];
  checklist?: string | null;
  lon?: number | null;
  lat?: number | null;
  prescription?: string | null;
  /** Orden de trabajo en JSON. */
  workOrder?: string | null;
}): Promise<{ ids: string[] }> {
  sdb.require(can.assign);
  await sdb.requireFarm(input.farmId, true);
  await sdb.memberRole(input.assigneeId);
  const { plotIds, ...base } = input;
  const wanted = [...new Set(plotIds.filter((p): p is string => !!p))];
  if (wanted.length) {
    const found = await sdb.db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(
        and(
          eq(s.plots.organizationId, sdb.auth.orgId),
          eq(s.plots.farmId, input.farmId),
          inArray(s.plots.id, wanted),
          isNull(s.plots.deletedAt),
        ),
      );
    if (found.length !== wanted.length) throw new NotFoundError("Lote inexistente");
  }
  const targets = [...new Set(plotIds)];
  const ids = targets.map(() => newId());
  const ts = sdb.now();
  await runBatch(sdb.db, [
    bumpVersion(sdb.db),
    ...targets.map((plotId, i) =>
      sdb.db.insert(s.tasks).values({
        ...base,
        plotId,
        id: ids[i]!,
        organizationId: sdb.auth.orgId,
        createdBy: sdb.auth.userId,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
    ),
    ...sdb.audit({
      action: "task_create",
      entity: "task",
      entityId: ids[0] ?? null,
      detail: { farmId: input.farmId, count: ids.length, assigneeId: input.assigneeId, title: input.title },
    }),
  ]);
  return { ids };
}
