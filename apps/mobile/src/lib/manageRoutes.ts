import type { ManageId, OwnerDashboard } from "@yvy/shared";

/** Pantalla de cada entrada del menú de Gestión. */
export const MANAGE_HREF: Record<ManageId, string> = {
  alerts: "/manage/alerts",
  review: "/manage/review",
  tasks: "/manage/tasks",
  calendar: "/manage/calendar",
  report: "/manage/report",
  climate: "/manage/climate",
  team: "/manage/team",
  clients: "/manage/clients",
};

/** El margen es plata: se muestra con la respuesta de ahora, pero no se guarda en el celular. */
export const withoutMargin = (b: OwnerDashboard): OwnerDashboard => ({ ...b, margin: null });

export const DASHBOARD_TTL_MS = 10 * 60_000;
