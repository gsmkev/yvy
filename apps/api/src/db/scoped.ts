/**
 * Capa de acceso única: reemplaza a RLS (PRD §9, PRD-cloudflare §4.1).
 * Toda consulta de una ruta autenticada pasa por acá. Siempre filtra por organization_id y,
 * para `worker`, por los lotes asignados. Nunca consultar D1 directo desde una ruta.
 */
import { and, asc, eq, gt, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  LIMITS,
  localDate,
  newId,
  type Cursor,
  type PullResponse,
  type PullTable,
  type RejectReason,
  type Role,
  type SyncState,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { bumpVersion, currentVersion, runBatch, type DB, type Stmt } from "./client";

export interface AuthCtx {
  userId: string;
  orgId: string;
  role: Role;
}

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

interface SyncedTable {
  table: SQLiteTable;
  org: AnySQLiteColumn;
  version: AnySQLiteColumn;
  id: AnySQLiteColumn;
}

const SYNCED: Record<PullTable, SyncedTable> = {
  farms: { table: s.farms, org: s.farms.organizationId, version: s.farms.version, id: s.farms.id },
  plots: { table: s.plots, org: s.plots.organizationId, version: s.plots.version, id: s.plots.id },
  points_of_interest: {
    table: s.pointsOfInterest,
    org: s.pointsOfInterest.organizationId,
    version: s.pointsOfInterest.version,
    id: s.pointsOfInterest.id,
  },
  plot_assignments: {
    table: s.plotAssignments,
    org: s.plotAssignments.organizationId,
    version: s.plotAssignments.version,
    id: s.plotAssignments.id,
  },
  tasks: { table: s.tasks, org: s.tasks.organizationId, version: s.tasks.version, id: s.tasks.id },
  records: { table: s.records, org: s.records.organizationId, version: s.records.version, id: s.records.id },
  attachments: {
    table: s.attachments,
    org: s.attachments.organizationId,
    version: s.attachments.version,
    id: s.attachments.id,
  },
  alerts: { table: s.alerts, org: s.alerts.organizationId, version: s.alerts.version, id: s.alerts.id },
  plot_index_stats: {
    table: s.plotIndexStats,
    org: s.plotIndexStats.organizationId,
    version: s.plotIndexStats.version,
    id: s.plotIndexStats.id,
  },
  farm_layers: {
    table: s.farmLayers,
    org: s.farmLayers.organizationId,
    version: s.farmLayers.version,
    id: s.farmLayers.id,
  },
  seasons: { table: s.seasons, org: s.seasons.organizationId, version: s.seasons.version, id: s.seasons.id },
  plot_seasons: {
    table: s.plotSeasons,
    org: s.plotSeasons.organizationId,
    version: s.plotSeasons.version,
    id: s.plotSeasons.id,
  },
  products: { table: s.products, org: s.products.organizationId, version: s.products.version, id: s.products.id },
};

/** Matriz de permisos (PRD §9). */
export const can = {
  manageOrg: (r: Role) => r === "owner",
  /** RF-04: el administrador también crea empleados. */
  manageWorkers: (r: Role) => r === "owner" || r === "admin",
  editField: (r: Role) => r !== "worker",
  /** PRD §9: crear/editar puntos de interés (también desde el celular, PRD §11): todos menos `worker`. */
  editPoi: (r: Role) => r !== "worker",
  assign: (r: Role) => r !== "worker",
  viewAll: (r: Role) => r !== "worker",
  reports: (r: Role) => r !== "worker",
  /** C-04: solo dueño y administrador cambian los umbrales de avisos. */
  /** K-04: solo el dueño crea y revoca enlaces de solo lectura. */
  shareLinks: (r: Role) => r === "owner",
  alertSettings: (r: Role) => r === "owner" || r === "admin",
  /** G-10: planificar el calendario sanitario (y crear sus tareas): todos menos el empleado. */
  planSanitary: (r: Role) => r !== "worker",
  /** ADR 0004: campañas y su plan por lote; el empleado solo las ve. */
  editSeasons: (r: Role) => r !== "worker",
  /** ADR 0004: catálogo de productos; el empleado lo recibe en el celular pero no lo edita. */
  editProducts: (r: Role) => r !== "worker",
};

export class ScopedDb {
  constructor(
    readonly db: DB,
    readonly auth: AuthCtx,
    readonly now: () => number = Date.now,
  ) {}

  get isWorker(): boolean {
    return this.auth.role === "worker";
  }

  require(check: (r: Role) => boolean, msg = "No tenés permiso"): void {
    if (!check(this.auth.role)) throw new ForbiddenError(msg);
  }

  /** Puede editar/borrar un registro (PRD §9 y RF-34). */
  canEditRecord(rec: { authorId: string; createdAt: number }): RejectReason | null {
    const { role, userId } = this.auth;
    if (role === "owner" || role === "admin") return null;
    if (rec.authorId !== userId) return "forbidden";
    if (role === "worker" && this.now() - rec.createdAt > LIMITS.sync.workerEditWindowMs) return "edit_window_expired";
    return null;
  }

  // ---------- Filtros de visibilidad ----------

  assignedPlotsSql(): SQL {
    return sql`(SELECT plot_id FROM plot_assignments WHERE user_id = ${this.auth.userId} AND organization_id = ${this.auth.orgId} AND deleted_at IS NULL)`;
  }

  workerFarmsSql(): SQL {
    return sql`(SELECT farm_id FROM plots WHERE id IN ${this.assignedPlotsSql()})`;
  }

  /** Empleado: registros de sus lotes, o propios (incluye los sin lote). */
  recordsVisibleSql(): SQL {
    return sql`(records.plot_id IN ${this.assignedPlotsSql()} OR records.author_id = ${this.auth.userId})`;
  }

  workerFilter(table: PullTable): SQL | undefined {
    if (!this.isWorker) return undefined;
    switch (table) {
      case "farms":
        return sql`farms.id IN ${this.workerFarmsSql()}`;
      case "plots":
        return sql`plots.id IN ${this.assignedPlotsSql()}`;
      case "points_of_interest":
        return sql`points_of_interest.farm_id IN ${this.workerFarmsSql()}`;
      case "plot_assignments":
        return sql`plot_assignments.user_id = ${this.auth.userId}`;
      case "tasks":
        return sql`tasks.assignee_id = ${this.auth.userId}`;
      case "records":
        return this.recordsVisibleSql();
      case "attachments":
        return sql`attachments.record_id IN (SELECT id FROM records WHERE organization_id = ${this.auth.orgId} AND ${this.recordsVisibleSql()})`;
      case "alerts":
        return sql`alerts.id IN (SELECT alert_id FROM alert_plots WHERE plot_id IN ${this.assignedPlotsSql()})`;
      case "plot_index_stats":
        return sql`0`; // PRD §11: no baja al empleado
      case "farm_layers":
        return sql`farm_layers.farm_id IN ${this.workerFarmsSql()}`;
      case "seasons":
        return undefined; // las campañas son de toda la organización: el empleado las necesita para anotar
      case "plot_seasons":
        return sql`plot_seasons.plot_id IN ${this.assignedPlotsSql()}`;
      case "products":
        return undefined; // el catálogo es de toda la organización
    }
  }

  /** Ventana de historial que baja al celular (PRD §11). */
  private historyFilter(table: PullTable): SQL | undefined {
    const now = this.now();
    // Hacienda: todos los conteos y un año de movimientos y mortandad, para calcular el stock en el celular (G-03).
    if (table === "records")
      return or(
        gte(s.records.capturedAt, now - LIMITS.sync.recordsHistoryMs),
        eq(s.records.kind, "herd_count"),
        and(
          inArray(s.records.kind, ["herd_move", "mortality"]),
          gte(s.records.capturedAt, now - LIMITS.sync.herdEventsHistoryMs),
        ),
      );
    if (table === "attachments") return gte(s.attachments.createdAt, now - LIMITS.sync.recordsHistoryMs);
    if (table === "plot_index_stats") return gte(s.plotIndexStats.acquiredAt, now - LIMITS.sync.indexStatsHistoryMs);
    // B7: tareas abiertas, o cerradas/canceladas hace menos de 30 días.
    if (table === "tasks")
      return or(
        eq(s.tasks.status, "open"),
        gte(sql`coalesce(${s.tasks.completedAt}, ${s.tasks.updatedAt})`, now - LIMITS.sync.tasksDoneHistoryMs),
      );
    return undefined;
  }

  // ---------- Sincronización ----------

  async syncState(): Promise<SyncState> {
    const [m] = await this.db
      .select({ v: s.memberships.assignmentsVersion })
      .from(s.memberships)
      .where(and(eq(s.memberships.organizationId, this.auth.orgId), eq(s.memberships.userId, this.auth.userId)))
      .limit(1);
    return {
      userId: this.auth.userId,
      organizationId: this.auth.orgId,
      role: this.auth.role,
      assignmentsVersion: m?.v ?? 0,
      serverTime: this.now(),
    };
  }

  async pull(table: PullTable, cursor: Cursor | null, limit: number = LIMITS.sync.pullPageSize): Promise<PullResponse> {
    const t = SYNCED[table];
    const after = cursor
      ? or(gt(t.version, cursor.version), and(eq(t.version, cursor.version), gt(t.id, cursor.id)))
      : undefined;
    const rows = (await this.db
      .select()
      .from(t.table)
      .where(and(eq(t.org, this.auth.orgId), this.workerFilter(table), this.historyFilter(table), after))
      .orderBy(asc(t.version), asc(t.id))
      .limit(limit + 1)) as (Record<string, unknown> & { id: string; version: number })[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { table, rows: page, cursor: last ? { version: last.version, id: last.id } : null, hasMore };
  }

  // ---------- Adjuntos ----------

  async getAttachment(id: string) {
    const [row] = await this.db
      .select({ a: s.attachments })
      .from(s.attachments)
      .where(
        and(
          eq(s.attachments.id, id),
          eq(s.attachments.organizationId, this.auth.orgId),
          isNull(s.attachments.deletedAt),
          this.workerFilter("attachments"),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Foto inexistente");
    return row.a;
  }

  async markAttachmentUploaded(id: string, bytes: number | null): Promise<void> {
    const ts = this.now();
    await runBatch(this.db, [
      bumpVersion(this.db),
      this.db
        .update(s.attachments)
        .set({ uploadStatus: "uploaded", updatedAt: ts, version: currentVersion, ...(bytes ? { bytes } : {}) })
        .where(and(eq(s.attachments.id, id), eq(s.attachments.organizationId, this.auth.orgId))),
    ]);
  }

  // ---------- Baja de la cuenta (P-09) ----------

  /** Registra el pedido de baja (solo dueño). Idempotente: si ya hay uno pendiente, lo devuelve. */
  async requestDeletion(): Promise<{
    id: string;
    created: boolean;
    organizationName: string;
    requester: string;
  }> {
    this.require(can.manageOrg, "Solo el dueño pide la baja de la cuenta");
    const [org] = await this.db
      .select({ name: s.organizations.name })
      .from(s.organizations)
      .where(eq(s.organizations.id, this.auth.orgId))
      .limit(1);
    const [user] = await this.db
      .select({ email: s.users.email, fullName: s.users.fullName })
      .from(s.users)
      .where(eq(s.users.id, this.auth.userId))
      .limit(1);
    const requester = `${user?.fullName ?? ""} (${user?.email ?? "sin email"})`;
    const [pending] = await this.db
      .select({ id: s.deletionRequests.id })
      .from(s.deletionRequests)
      .where(and(eq(s.deletionRequests.organizationId, this.auth.orgId), eq(s.deletionRequests.status, "pending")))
      .limit(1);
    const organizationName = org?.name ?? "";
    if (pending) return { id: pending.id, created: false, organizationName, requester };
    const id = newId();
    await this.db.insert(s.deletionRequests).values({
      id,
      organizationId: this.auth.orgId,
      userId: this.auth.userId,
      createdAt: this.now(),
    });
    return { id, created: true, organizationName, requester };
  }

  // ---------- Miembros y asignaciones ----------

  /** Miembros con su actividad de los últimos 7 días: tres consultas agrupadas, sin N+1. */
  async listMembers() {
    this.require(can.assign);
    const org = this.auth.orgId;
    const since = this.now() - 7 * 86_400_000;
    const sinceDay = localDate(this.now() - 6 * 86_400_000);
    const [members, days, recs, syncs] = await Promise.all([
      this.db
        .select({
          userId: s.users.id,
          fullName: s.users.fullName,
          email: s.users.email,
          phone: s.users.phone,
          role: s.memberships.role,
          status: s.memberships.status,
        })
        .from(s.memberships)
        .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
        .where(and(eq(s.memberships.organizationId, org), isNull(s.memberships.deletedAt))),
      this.db
        .select({ userId: s.activityDaily.userId, n: sql<number>`count(*)` })
        .from(s.activityDaily)
        .where(and(eq(s.activityDaily.organizationId, org), gte(s.activityDaily.day, sinceDay)))
        .groupBy(s.activityDaily.userId),
      this.db
        .select({ userId: s.records.authorId, n: sql<number>`count(*)` })
        .from(s.records)
        .where(and(eq(s.records.organizationId, org), isNull(s.records.deletedAt), gte(s.records.capturedAt, since)))
        .groupBy(s.records.authorId),
      this.db
        .select({ userId: s.devices.userId, at: sql<number | null>`max(${s.devices.lastSyncAt})` })
        .from(s.devices)
        .where(
          sql`${s.devices.userId} IN (SELECT user_id FROM memberships WHERE organization_id = ${org} AND deleted_at IS NULL)`,
        )
        .groupBy(s.devices.userId),
    ]);
    const n = (rows: { userId: string; n: number }[]) => new Map(rows.map((r) => [r.userId, Number(r.n)]));
    const activeDays = n(days);
    const records = n(recs);
    const lastSync = new Map(syncs.map((r) => [r.userId, r.at]));
    return members.map((m) => ({
      ...m,
      activeDays7: activeDays.get(m.userId) ?? 0,
      records7d: records.get(m.userId) ?? 0,
      lastSyncAt: lastSync.get(m.userId) ?? null,
    }));
  }

  async addMember(input: {
    fullName: string;
    email: string | null;
    phone: string | null;
    role: Role;
  }): Promise<{ userId: string }> {
    if (input.role === "worker") this.require(can.manageWorkers, "Solo dueño o administrador crean empleados");
    else this.require(can.manageOrg, "Solo el dueño gestiona miembros");
    if (input.role !== "worker" && !input.email) throw new ForbiddenError("Falta el email");
    const ts = this.now();
    let userId: string | undefined;
    if (input.email) {
      const [u] = await this.db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, input.email)).limit(1);
      userId = u?.id;
    }
    const stmts: Stmt[] = [];
    if (!userId) {
      userId = newId();
      stmts.push(
        this.db.insert(s.users).values({
          id: userId,
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
    }
    stmts.push(
      this.db
        .insert(s.memberships)
        .values({
          id: newId(),
          organizationId: this.auth.orgId,
          userId,
          role: input.role,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: [s.memberships.organizationId, s.memberships.userId],
          set: { role: input.role, status: "active", deletedAt: null, updatedAt: ts },
        }),
    );
    await runBatch(this.db, stmts);
    return { userId };
  }

  async memberRole(userId: string): Promise<Role> {
    const [m] = await this.db
      .select({ role: s.memberships.role })
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.organizationId, this.auth.orgId),
          eq(s.memberships.userId, userId),
          isNull(s.memberships.deletedAt),
        ),
      )
      .limit(1);
    if (!m) throw new NotFoundError("El usuario no pertenece a la organización");
    return m.role;
  }

  /** Reemplaza los lotes asignados a un usuario y avisa al cliente que rehaga sus tablas. */
  async setAssignments(userId: string, plotIds: string[]): Promise<void> {
    this.require(can.assign);
    await this.memberRole(userId);
    const wanted = [...new Set(plotIds)];
    if (wanted.length) {
      const found = await this.db
        .select({ id: s.plots.id })
        .from(s.plots)
        .where(
          and(eq(s.plots.organizationId, this.auth.orgId), inArray(s.plots.id, wanted), isNull(s.plots.deletedAt)),
        );
      if (found.length !== wanted.length) throw new NotFoundError("Lote inexistente");
    }
    const current = await this.db
      .select({ id: s.plotAssignments.id, plotId: s.plotAssignments.plotId, deletedAt: s.plotAssignments.deletedAt })
      .from(s.plotAssignments)
      .where(and(eq(s.plotAssignments.organizationId, this.auth.orgId), eq(s.plotAssignments.userId, userId)));
    const ts = this.now();
    const byPlot = new Map(current.map((a) => [a.plotId, a]));
    const stmts: Stmt[] = [bumpVersion(this.db)];
    for (const a of current) {
      if (!a.deletedAt && !wanted.includes(a.plotId)) {
        stmts.push(
          this.db
            .update(s.plotAssignments)
            .set({ deletedAt: ts, updatedAt: ts, version: currentVersion })
            .where(eq(s.plotAssignments.id, a.id)),
        );
      }
    }
    for (const plotId of wanted) {
      const prev = byPlot.get(plotId);
      if (prev && !prev.deletedAt) continue;
      if (prev) {
        stmts.push(
          this.db
            .update(s.plotAssignments)
            .set({ deletedAt: null, updatedAt: ts, version: currentVersion })
            .where(eq(s.plotAssignments.id, prev.id)),
        );
      } else {
        stmts.push(
          this.db.insert(s.plotAssignments).values({
            id: newId(),
            organizationId: this.auth.orgId,
            plotId,
            userId,
            createdAt: ts,
            updatedAt: ts,
            version: currentVersion,
          }),
        );
      }
    }
    if (stmts.length === 1) return;
    stmts.push(
      this.db
        .update(s.memberships)
        .set({ assignmentsVersion: sql`${s.memberships.assignmentsVersion} + 1`, updatedAt: ts })
        .where(and(eq(s.memberships.organizationId, this.auth.orgId), eq(s.memberships.userId, userId))),
    );
    await runBatch(this.db, stmts);
  }

  // ---------- Estancias, lotes, puntos de interés ----------

  /** Verifica que la estancia sea de la organización y devuelve su geometría (GeoJSON texto). */
  async requireFarm(farmId: string): Promise<string> {
    const [f] = await this.db
      .select({ id: s.farms.id, geometry: s.farms.geometry })
      .from(s.farms)
      .where(and(eq(s.farms.id, farmId), eq(s.farms.organizationId, this.auth.orgId), isNull(s.farms.deletedAt)))
      .limit(1);
    if (!f) throw new NotFoundError("Estancia inexistente");
    return f.geometry;
  }

  async createFarm(
    input: Omit<typeof s.farms.$inferInsert, "id" | "organizationId" | "createdAt" | "updatedAt" | "version">,
  ) {
    this.require(can.editField);
    const id = newId();
    const ts = this.now();
    await runBatch(this.db, [
      bumpVersion(this.db),
      this.db.insert(s.farms).values({
        ...input,
        id,
        organizationId: this.auth.orgId,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
      this.db.insert(s.farmImagery).values({ farmId: id, status: "pending", requestedAt: ts, updatedAt: ts }),
    ]);
    return { id };
  }

  /** Lotes vivos de una estancia de la organización (1 query). */
  async countPlots(farmId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farmId), eq(s.plots.organizationId, this.auth.orgId), isNull(s.plots.deletedAt)));
    return Number(r?.n ?? 0);
  }

  /** Alta de varios lotes de una vez (importación KML). */
  async createPlots(
    farmId: string,
    items: Omit<
      typeof s.plots.$inferInsert,
      "id" | "organizationId" | "farmId" | "createdAt" | "updatedAt" | "version"
    >[],
  ): Promise<{ ids: string[]; farmGeometry: string }> {
    this.require(can.editField);
    const farmGeometry = await this.requireFarm(farmId);
    const ts = this.now();
    const ids = items.map(() => newId());
    // Una sentencia por lote: las geometrías son largas y no conviene agruparlas.
    await runBatch(this.db, [
      bumpVersion(this.db),
      ...items.map((p, i) =>
        this.db.insert(s.plots).values({
          ...p,
          id: ids[i]!,
          organizationId: this.auth.orgId,
          farmId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        }),
      ),
    ]);
    return { ids, farmGeometry };
  }

  async createPoi(input: {
    farmId: string;
    kind: (typeof s.POI_KINDS)[number];
    name: string;
    lon: number;
    lat: number;
  }) {
    this.require(can.editField);
    await this.requireFarm(input.farmId);
    const id = newId();
    const ts = this.now();
    await runBatch(this.db, [
      bumpVersion(this.db),
      this.db.insert(s.pointsOfInterest).values({
        ...input,
        id,
        organizationId: this.auth.orgId,
        createdAt: ts,
        updatedAt: ts,
        version: currentVersion,
      }),
    ]);
    return { id };
  }

  // ---------- Tareas ----------

  /**
   * Receta → órdenes de trabajo (A-11): una tarea de aplicación por lote, para el mismo empleado, con la
   * receta adentro. 3 lecturas y un solo batch (una fila por lote, máx. 40).
   */
  async createPrescription(input: {
    farmId: string;
    plotIds: string[];
    assigneeId: string;
    title: string;
    dueDate: string;
    prescription: string;
  }): Promise<{ ids: string[] }> {
    this.require(can.assign);
    await this.requireFarm(input.farmId);
    await this.memberRole(input.assigneeId);
    const plotIds = [...new Set(input.plotIds)];
    const found = await this.db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(
        and(
          eq(s.plots.organizationId, this.auth.orgId),
          eq(s.plots.farmId, input.farmId),
          inArray(s.plots.id, plotIds),
          isNull(s.plots.deletedAt),
        ),
      );
    if (found.length !== plotIds.length) throw new NotFoundError("Lote inexistente");
    const ts = this.now();
    const ids = plotIds.map(() => newId());
    await runBatch(this.db, [
      bumpVersion(this.db),
      ...plotIds.map((plotId, i) =>
        this.db.insert(s.tasks).values({
          id: ids[i]!,
          organizationId: this.auth.orgId,
          farmId: input.farmId,
          plotId,
          assigneeId: input.assigneeId,
          title: input.title,
          kind: "application",
          dueDate: input.dueDate,
          recurrence: "none",
          prescription: input.prescription,
          createdBy: this.auth.userId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        }),
      ),
    ]);
    return { ids };
  }

  async createTask(input: {
    farmId: string;
    plotId: string | null;
    assigneeId: string;
    title: string;
    kind: (typeof s.RECORD_KINDS)[number] | null;
    dueDate: string;
    dueTime?: string | null;
    priority?: (typeof s.TASK_PRIORITIES)[number];
    recurrence: (typeof s.RECURRENCES)[number];
    /** Lista de verificación en JSON (F-15). */
    checklist?: string | null;
    lon?: number | null;
    lat?: number | null;
    prescription?: string | null;
  }) {
    const { ids } = await this.createTasks({ ...input, plotIds: [input.plotId] });
    return { id: ids[0]! };
  }

  /**
   * Una tarea por lote (T-01: elegir lotes en el mapa), todas en un mismo batch. `plotIds` con `null` crea una
   * tarea sin lote. Los lotes tienen que ser de la estancia y de la organización.
   */
  async createTasks(input: {
    farmId: string;
    plotIds: (string | null)[];
    assigneeId: string;
    title: string;
    kind: (typeof s.RECORD_KINDS)[number] | null;
    dueDate: string;
    dueTime?: string | null;
    priority?: (typeof s.TASK_PRIORITIES)[number];
    recurrence: (typeof s.RECURRENCES)[number];
  }): Promise<{ ids: string[] }> {
    this.require(can.assign);
    await this.requireFarm(input.farmId);
    await this.memberRole(input.assigneeId);
    const { plotIds, ...base } = input;
    const wanted = [...new Set(plotIds.filter((p): p is string => !!p))];
    if (wanted.length) {
      const found = await this.db
        .select({ id: s.plots.id })
        .from(s.plots)
        .where(
          and(
            eq(s.plots.organizationId, this.auth.orgId),
            eq(s.plots.farmId, input.farmId),
            inArray(s.plots.id, wanted),
            isNull(s.plots.deletedAt),
          ),
        );
      if (found.length !== wanted.length) throw new NotFoundError("Lote inexistente");
    }
    const targets = [...new Set(plotIds)];
    const ids = targets.map(() => newId());
    const ts = this.now();
    await runBatch(this.db, [
      bumpVersion(this.db),
      ...targets.map((plotId, i) =>
        this.db.insert(s.tasks).values({
          ...base,
          plotId,
          id: ids[i]!,
          organizationId: this.auth.orgId,
          createdBy: this.auth.userId,
          createdAt: ts,
          updatedAt: ts,
          version: currentVersion,
        }),
      ),
    ]);
    return { ids };
  }
}
