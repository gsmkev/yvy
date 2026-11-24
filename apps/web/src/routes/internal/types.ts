/** Tipos de las respuestas del panel interno del equipo. */

/** Métricas de uso de una organización: plan, topes, usuarios, estancias, hectáreas, registros y actividad. */
export interface OrgMetrics {
  id: string;
  name: string;
  plan: string;
  trialEndsAt: number | null;
  maxHaOwn: number | null;
  maxUsersOwn: number | null;
  limits: { maxHa: number | null; maxUsers: number | null };
  users: number;
  farms: number;
  ha: number;
  workers: number;
  records7d: number;
  activeWorkers7d: number;
  recordsPerActiveWorker: number | null;
  owners: number;
  ownersActivePct: number | null;
  usefulPct: number | null;
  lastActive: string | null;
  /** Código de referido con el que se registró y agrónomo dueño del código. */
  referredBy: string | null;
  referrerName: string | null;
  /** Quién lo refirió (si se pudo identificar) y cuándo el equipo anotó el crédito. */
  referrerUserId: string | null;
  referralCreditedAt: number | null;
}
