/** Tipos de respuesta del plan de una organización y sus pedidos de cambio. */

/** Pedido de cambio de plan con su estado y resolución. */
export interface PlanRequestRow {
  id: string;
  plan: string;
  maxHa: number | null;
  maxUsers: number | null;
  note: string | null;
  status: string;
  createdAt: number;
  resolutionNote: string | null;
}

/** Plan vigente, topes, uso y pedidos de cambio de una organización. */
export interface PlanView {
  plan: string;
  trialEndsAt: number | null;
  limits: { maxHa: number | null; maxUsers: number | null };
  usage: { ha: number; users: number };
  plans: { active: { maxHa: number | null; maxUsers: number | null } };
  pending: PlanRequestRow | null;
  lastResolved: PlanRequestRow | null;
}
