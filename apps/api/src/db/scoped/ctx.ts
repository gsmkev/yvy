/**
 * Lo que los módulos de `scoped` necesitan de `ScopedDb`. Vive aparte para que los módulos no importen la clase
 * (que a su vez los importa a ellos) y no haya dependencias circulares.
 */
import type { SQL } from "drizzle-orm";
import type { planLimits, PullTable, RejectReason, Role } from "@yvy/shared";
import type { AuditEntry } from "../audit";
import type { DB, Stmt } from "../client";
import type { AuthCtx } from "./permissions";

/** Superficie de `ScopedDb` que usan los módulos: datos, sesión, reloj, permisos y los filtros que se llaman entre sí. */
export interface ScopedCtx {
  readonly db: DB;
  readonly auth: AuthCtx;
  readonly now: () => number;
  readonly isWorker: boolean;
  readonly isContractor: boolean;
  require(check: (r: Role) => boolean, msg?: string): void;
  audit(...entries: AuditEntry[]): Stmt[];
  canEditRecord(rec: { authorId: string; createdAt: number }): RejectReason | null;
  assignedPlotsSql(): SQL;
  workerFarmsSql(): SQL;
  recordsVisibleSql(): SQL;
  farmScopeSql(col: string, write?: boolean): SQL | undefined;
  isFarmRestricted(): Promise<boolean>;
  workerFilter(table: PullTable, write?: boolean): SQL | undefined;
  memberRole(userId: string): Promise<Role>;
  membersWithPin(): Promise<Set<string>>;
  requireFarm(farmId: string, write?: boolean): Promise<string>;
  planLimits(): Promise<ReturnType<typeof planLimits>>;
  requireHaRoom(extraHa: number, what?: "farms" | "plots"): Promise<void>;
  requireUserRoom(existingUserId: string | null): Promise<void>;
}
