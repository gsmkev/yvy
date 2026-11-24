/** Miembros de la organización (GET /org/members). Tipo copiado de apps/web/src/lib/types.ts. */
export interface Member {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  activeDays7: number;
  records7d: number;
  plotsVisited7d: number;
  lastSyncAt: number | null;
  overdueTasks: number;
  hasPin?: boolean;
}

const FIELD_ROLES = ["worker", "contractor"];
export const isFieldRoleName = (r: string): boolean => FIELD_ROLES.includes(r);
