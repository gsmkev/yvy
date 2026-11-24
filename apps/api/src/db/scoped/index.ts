/**
 * Capa de acceso única: reemplaza a RLS (PRD §9, PRD-cloudflare §4.1).
 * Toda consulta de una ruta autenticada pasa por acá. Siempre filtra por organization_id y,
 * para `worker`, por los lotes asignados. Nunca consultar D1 directo desde una ruta.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import { isFieldRole, LIMITS, type RejectReason, type Role } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB, Stmt } from "../client";
import { auditStmts, type AuditEntry } from "../audit";
import { type AuthCtx, ForbiddenError } from "./permissions";
import * as visibility from "./visibility";
import * as sync from "./sync";
import * as members from "./members";
import * as farmAccess from "./farm-access";
import * as plan from "./plan-limits";
import * as farms from "./farms";
import * as tasks from "./tasks";
export { can, ForbiddenError, NotFoundError, PlanLimitError, type AuthCtx } from "./permissions";
export { SYNCED_KEYS } from "./synced-tables";
/** Argumentos de un método sin el primero (la fachada pasa `this`). */
type Rest<F> = F extends (first: ScopedDb, ...a: infer R) => unknown ? R : never;

export class ScopedDb {
  constructor(
    readonly db: DB,
    readonly auth: AuthCtx,
    readonly now: () => number = Date.now,
  ) {}

  /** Rol de campo (empleado o contratista): ve solo sus lotes asignados y sus tareas. */
  get isWorker(): boolean {
    return isFieldRole(this.auth.role);
  }

  get isContractor(): boolean {
    return this.auth.role === "contractor";
  }

  require(check: (r: Role) => boolean, msg = "No tenés permiso"): void {
    if (!check(this.auth.role)) throw new ForbiddenError(msg);
  }

  /** K-06: filas del registro de cambios, para sumar al batch del cambio. */
  audit(...entries: AuditEntry[]): Stmt[] {
    return auditStmts(this.db, this.auth, entries, this.now());
  }

  /** Puede editar/borrar un registro (PRD §9 y RF-34). */
  canEditRecord(rec: { authorId: string; createdAt: number }): RejectReason | null {
    const { role, userId } = this.auth;
    if (role === "owner" || role === "admin") return null;
    if (rec.authorId !== userId) return "forbidden";
    if (isFieldRole(role) && this.now() - rec.createdAt > LIMITS.sync.workerEditWindowMs) return "edit_window_expired";
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
    // K-03: el contratista solo ve lo que cargó él.
    if (this.isContractor) return sql`records.author_id = ${this.auth.userId}`;
    return sql`(records.plot_id IN ${this.assignedPlotsSql()} OR records.author_id = ${this.auth.userId})`;
  }

  /**
   * T-09 / K-05: condición para limitar `col` (columna con id de estancia) a las estancias de la persona.
   * `undefined` = sin límite (dueño y roles de campo, que se limitan por lotes). Con `write`, solo las de nivel `edit`.
   * Supervisor: solo las de farm_access. Administrador/agrónomo: todas mientras no tengan filas.
   */
  farmScopeSql(col: string, write = false): SQL | undefined {
    const { role, userId, orgId } = this.auth;
    if (role === "owner" || isFieldRole(role)) return undefined;
    const mine = sql`organization_id = ${orgId} AND user_id = ${userId}`;
    const c = sql.raw(col);
    const rows = write
      ? sql`(SELECT farm_id FROM farm_access WHERE ${mine} AND level = 'edit')`
      : sql`(SELECT farm_id FROM farm_access WHERE ${mine})`;
    if (role === "supervisor") return sql`${c} IN ${rows}`;
    return sql`(NOT EXISTS (SELECT 1 FROM farm_access WHERE ${mine}) OR ${c} IN ${rows})`;
  }

  /** ¿Tiene limitadas las estancias que ve? (supervisor siempre; admin/agrónomo si el dueño les dio una lista). */
  async isFarmRestricted(): Promise<boolean> {
    const { role, userId, orgId } = this.auth;
    if (role === "owner" || isFieldRole(role)) return false;
    if (role === "supervisor") return true;
    const [r] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(s.farmAccess)
      .where(and(eq(s.farmAccess.organizationId, orgId), eq(s.farmAccess.userId, userId)));
    return Number(r?.n ?? 0) > 0;
  }

  // ---------- Filtros de visibilidad (visibility.ts) ----------

  /** Condición de visibilidad por tabla: lotes asignados (roles de campo) o estancias permitidas (supervisor, K-05). */
  workerFilter(...a: Rest<typeof visibility.workerFilter>) {
    return visibility.workerFilter(this, ...a);
  }

  // ---------- Sincronización y adjuntos (sync.ts) ----------

  syncState(...a: Rest<typeof sync.syncState>) {
    return sync.syncState(this, ...a);
  }

  pull(...a: Rest<typeof sync.pull>) {
    return sync.pull(this, ...a);
  }

  getAttachment(...a: Rest<typeof sync.getAttachment>) {
    return sync.getAttachment(this, ...a);
  }

  markAttachmentUploaded(...a: Rest<typeof sync.markAttachmentUploaded>) {
    return sync.markAttachmentUploaded(this, ...a);
  }

  // ---------- Miembros y asignaciones (members.ts) ----------

  /** Registra el pedido de baja (solo dueño). Idempotente: si ya hay uno pendiente, lo devuelve. */
  requestDeletion(...a: Rest<typeof members.requestDeletion>) {
    return members.requestDeletion(this, ...a);
  }

  /** Miembros con su actividad de los últimos 7 días: tres consultas agrupadas, sin N+1. */
  listMembers(...a: Rest<typeof members.listMembers>) {
    return members.listMembers(this, ...a);
  }

  addMember(...a: Rest<typeof members.addMember>) {
    return members.addMember(this, ...a);
  }

  memberRole(...a: Rest<typeof members.memberRole>) {
    return members.memberRole(this, ...a);
  }

  /**
   * F-24: fija o cambia el PIN de ingreso de un empleado (solo dueño o administrador). Guarda el teléfono en su
   * ficha y su clave normalizada. "phone_taken" si otra persona ya usa ese teléfono para ingresar.
   */
  setMemberPin(...a: Rest<typeof members.setMemberPin>) {
    return members.setMemberPin(this, ...a);
  }

  /** F-24: quita el PIN (el empleado ya no puede ingresar con teléfono). */
  clearMemberPin(...a: Rest<typeof members.clearMemberPin>) {
    return members.clearMemberPin(this, ...a);
  }

  /** F-24: teléfono guardado en la ficha de un miembro de la organización. */
  memberPhone(...a: Rest<typeof members.memberPhone>) {
    return members.memberPhone(this, ...a);
  }

  /** F-24: quiénes de la organización ya tienen PIN (para mostrarlo en Equipo). */
  membersWithPin(...a: Rest<typeof members.membersWithPin>) {
    return members.membersWithPin(this, ...a);
  }

  /** Reemplaza los lotes asignados a un usuario y avisa al cliente que rehaga sus tablas. */
  setAssignments(...a: Rest<typeof members.setAssignments>) {
    return members.setAssignments(this, ...a);
  }

  // ---------- Alcance por estancia (farm-access.ts) ----------

  /** Estancias a las que cada persona está limitada, para la pantalla de Equipo (solo el dueño). */
  listFarmAccess(...a: Rest<typeof farmAccess.listFarmAccess>) {
    return farmAccess.listFarmAccess(this, ...a);
  }

  /**
   * Reemplaza las estancias de una persona. Supervisor: sin filas no ve ninguna. Administrador y agrónomo: sin filas
   * ven todas; con filas, solo esas (`view` = solo lectura). Avisa al celular para que rehaga sus tablas.
   */
  setFarmAccess(...a: Rest<typeof farmAccess.setFarmAccess>) {
    return farmAccess.setFarmAccess(this, ...a);
  }

  // ---------- Topes del plan (plan-limits.ts) ----------

  /** Topes efectivos de la organización. */
  planLimits(...a: Rest<typeof plan.planLimits>) {
    return plan.planLimits(this, ...a);
  }

  /** Falla con 402 y un mensaje claro si sumar `extraHa` hectáreas de estancias pasa el tope del plan. */
  requireHaRoom(...a: Rest<typeof plan.requireHaRoom>) {
    return plan.requireHaRoom(this, ...a);
  }

  /** Falla con 402 si sumar una persona pasa el tope de usuarios (la que ya tiene acceso no cuenta de nuevo). */
  requireUserRoom(...a: Rest<typeof plan.requireUserRoom>) {
    return plan.requireUserRoom(this, ...a);
  }

  // ---------- Estancias, lotes y puntos de interés (farms.ts) ----------

  /** Verifica que la estancia sea de la organización y devuelve su geometría (GeoJSON texto). */
  requireFarm(...a: Rest<typeof farms.requireFarm>) {
    return farms.requireFarm(this, ...a);
  }

  /** La estancia existe en la organización y, si es empleado, tiene lotes asignados en ella. */
  requireFarmVisible(...a: Rest<typeof farms.requireFarmVisible>) {
    return farms.requireFarmVisible(this, ...a);
  }

  createFarm(...a: Rest<typeof farms.createFarm>) {
    return farms.createFarm(this, ...a);
  }

  /** Lotes vivos de una estancia de la organización (1 query). */
  countPlots(...a: Rest<typeof farms.countPlots>) {
    return farms.countPlots(this, ...a);
  }

  /** Alta de varios lotes de una vez (importación KML). */
  createPlots(...a: Rest<typeof farms.createPlots>) {
    return farms.createPlots(this, ...a);
  }

  createPoi(...a: Rest<typeof farms.createPoi>) {
    return farms.createPoi(this, ...a);
  }

  // ---------- Tareas (tasks.ts) ----------

  /**
   * Receta → órdenes de trabajo (A-11): una tarea de aplicación por lote, para el mismo empleado, con la
   * receta adentro. 3 lecturas y un solo batch (una fila por lote, máx. 40).
   */
  createPrescription(...a: Rest<typeof tasks.createPrescription>) {
    return tasks.createPrescription(this, ...a);
  }

  createTask(...a: Rest<typeof tasks.createTask>) {
    return tasks.createTask(this, ...a);
  }

  /**
   * Una tarea por lote (T-01: elegir lotes en el mapa), todas en un mismo batch. `plotIds` con `null` crea una
   * tarea sin lote. Los lotes tienen que ser de la estancia y de la organización.
   */
  createTasks(...a: Rest<typeof tasks.createTasks>) {
    return tasks.createTasks(this, ...a);
  }
}
