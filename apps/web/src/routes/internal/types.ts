
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
  /** V-05: código de referido con el que se registró y agrónomo dueño del código. */
  referredBy: string | null;
  referrerName: string | null;
  /** V-06: quién lo refirió (si se pudo identificar) y cuándo el equipo anotó el crédito. */
  referrerUserId: string | null;
  referralCreditedAt: number | null;
}
