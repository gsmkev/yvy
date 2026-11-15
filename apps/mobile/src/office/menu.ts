import { AlertTriangle, BarChart3, Building2, CalendarDays, ClipboardCheck, Columns3, ListChecks, Trees, Users } from "lucide-react-native";
import { groupMenu, GROUP_TITLE, type MenuCtx, type MenuGroup, type OfficeMenuItem } from "./menuLogic";

export { groupMenu, GROUP_TITLE };
export type { MenuCtx, MenuGroup, OfficeMenuItem };

/**
 * Registro del menú de la pestaña Gestión.
 *
 * PARA AGREGAR UNA PANTALLA: añadí una entrada AL FINAL de este arreglo y creá `app/office/<id>.tsx`.
 * No hace falta tocar ningún layout. Los grupos vacíos no se muestran.
 */
export const OFFICE_MENU: OfficeMenuItem[] = [
  { group: "campo", id: "alerts", title: "ui.alertsTitle", hint: "office.alertsRowHint", icon: AlertTriangle, href: "/office/alerts" },
  { group: "campo", id: "review", title: "ui.reviewTitle", hint: "office.reviewRowHint", icon: ClipboardCheck, href: "/office/review" },
  { group: "campo", id: "tasks", title: "office.tasksTitle", hint: "office.tasksRowHint", icon: ListChecks, href: "/office/tasks" },
  { group: "campo", id: "calendar", title: "ui.calendarTitle", hint: "office.calendarRowHint", icon: CalendarDays, href: "/office/calendar" },
  { group: "equipo", id: "team", title: "ui.teamTitle", hint: "office.teamRowHint", icon: Users, href: "/office/team", show: (c) => c.role === "owner" || c.role === "admin" },
  { group: "informes", id: "reports", title: "ui.reportsTitle", hint: "office.reportsRowHint", icon: BarChart3, href: "/office/reports" },
  { group: "informes", id: "compare", title: "ui.compareTitle", hint: "office.compareRowHint", icon: Columns3, href: "/office/compare", show: (c) => c.farms > 1 },
  { group: "campo", id: "farms", title: "ui.farmsTitle", hint: "office.farmsRowHint", icon: Trees, href: "/office/farms" },
  { group: "campo", id: "dashboard", title: "ui.dashTitle", hint: "office.dashboardRowHint", icon: BarChart3, href: "/office/dashboard", show: (c) => c.role === "owner" || c.role === "admin" || c.role === "agronomist" },
  { group: "cuenta", id: "clients", title: "ui.clientsTitle", hint: "office.clientsRowHint", icon: Building2, href: "/office/clients", show: (c) => c.hasClients },
  // ↓ agregá las nuevas entradas debajo de esta línea (solo al final)
];
