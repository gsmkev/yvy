import { Landmark, LifeBuoy, Search, Sprout, Package, CalendarRange, AlertTriangle, BarChart3, Beef, Building2, CalendarDays, ClipboardCheck, Columns3, HeartPulse, ListChecks, Trees, Users, Wheat } from "lucide-react-native";
import { isFieldRole } from "@yvy/shared";
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
  { group: "campo", id: "search", title: "office.searchTitle", hint: "office.searchRowHint", icon: Search, href: "/office/search" },
  { group: "campo", id: "alerts", title: "ui.alertsTitle", hint: "office.alertsRowHint", icon: AlertTriangle, href: "/office/alerts" },
  { group: "campo", id: "review", title: "ui.reviewTitle", hint: "office.reviewRowHint", icon: ClipboardCheck, href: "/office/review" },
  { group: "campo", id: "tasks", title: "office.tasksTitle", hint: "office.tasksRowHint", icon: ListChecks, href: "/office/tasks" },
  { group: "campo", id: "calendar", title: "ui.calendarTitle", hint: "office.calendarRowHint", icon: CalendarDays, href: "/office/calendar" },
  { group: "equipo", id: "team", title: "ui.teamTitle", hint: "office.teamRowHint", icon: Users, href: "/office/team", show: (c) => ["owner", "admin", "agronomist", "supervisor"].includes(c.role) },
  { group: "informes", id: "reports", title: "ui.reportsTitle", hint: "office.reportsRowHint", icon: BarChart3, href: "/office/reports" },
  { group: "informes", id: "compare", title: "ui.compareTitle", hint: "office.compareRowHint", icon: Columns3, href: "/office/compare", show: (c) => c.farms > 1 },
  { group: "campo", id: "farms", title: "ui.farmsTitle", hint: "office.farmsRowHint", icon: Trees, href: "/office/farms" },
  { group: "campo", id: "dashboard", title: "ui.dashTitle", hint: "office.dashboardRowHint", icon: BarChart3, href: "/office/dashboard", show: (c) => c.role === "owner" || c.role === "admin" || c.role === "agronomist" },
  { group: "cuenta", id: "clients", title: "ui.clientsTitle", hint: "office.clientsRowHint", icon: Building2, href: "/office/clients", show: (c) => c.hasClients },
  // ↓ agregá las nuevas entradas debajo de esta línea (solo al final)
  { group: "campo", id: "herd", title: "office.herdMenu", hint: "office.herdMenuHint", icon: Beef, href: "/office/herd", show: (c) => !isFieldRole(c.role) && c.plots > 0 },
  { group: "campo", id: "agro", title: "office.agroMenu", hint: "office.agroMenuHint", icon: Wheat, href: "/office/agro", show: (c) => !isFieldRole(c.role) && c.farms > 0 },
  { group: "campo", id: "sanitary", title: "ui.sanitaryTitle", hint: "office.sanitaryMenuHint", icon: HeartPulse, href: "/office/sanitary", show: (c) => !isFieldRole(c.role) && c.plots > 0 },
  { group: "campo", id: "plots", title: "office.plotsTitle", hint: "office.plotsRowHint", icon: Sprout, href: "/office/plots", show: (c) => c.plots > 0 },
  { group: "campo", id: "seasons", title: "ui.seasonsTitle", hint: "office.seasonsRowHint", icon: CalendarRange, href: "/office/seasons" },
  { group: "campo", id: "products", title: "ui.productsTitle", hint: "office.productsRowHint", icon: Package, href: "/office/products" },
  { group: "cuenta", id: "more-account", title: "office.moreAccountTitle", hint: "office.moreAccountHint", icon: LifeBuoy, href: "/office/more-account" },
  { group: "admin", id: "admin", title: "ui.navAdmin", hint: "office.admMenuHint", icon: Landmark, href: "/office/admin", show: (c) => c.role === "owner" || c.role === "admin" || c.role === "agronomist" },
];
