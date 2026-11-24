/** Menú de la pestaña Gestión: entradas, íconos y rutas. */
import { Landmark, LifeBuoy, Search, Sprout, Package, CalendarRange, AlertTriangle, BarChart3, Beef, Building2, CalendarDays, ClipboardCheck, Columns3, HeartPulse, ListChecks, Trees, Users, Wheat } from "lucide-react-native";
import { isFieldRole } from "@yvy/shared";
import { groupMenu, GROUP_TITLE, type MenuCtx, type OfficeMenuItem } from "./menuLogic";

export { groupMenu, GROUP_TITLE };
/** Contexto con el que se decide qué entradas del menú se muestran. */
export type { MenuCtx };

/**
 * Registro del menú de la pestaña Gestión.
 *
 * PARA AGREGAR UNA PANTALLA: añadí una entrada AL FINAL de este arreglo y creá `app/office/<id>.tsx`.
 * No hace falta tocar ningún layout. Los grupos vacíos no se muestran.
 */
export const OFFICE_MENU: OfficeMenuItem[] = [
  { group: "campo", id: "search", title: "office.search.title", hint: "office.search.rowHint", icon: Search, href: "/office/search" },
  { group: "campo", id: "alerts", title: "ui.alerts.title", hint: "office.alerts.rowHint", icon: AlertTriangle, href: "/office/alerts" },
  { group: "campo", id: "review", title: "ui.review.title", hint: "office.common.reviewRowHint", icon: ClipboardCheck, href: "/office/review" },
  { group: "campo", id: "tasks", title: "office.tasks.title", hint: "office.tasks.rowHint", icon: ListChecks, href: "/office/tasks" },
  { group: "campo", id: "calendar", title: "ui.calendar.title", hint: "office.calendar.rowHint", icon: CalendarDays, href: "/office/calendar" },
  { group: "equipo", id: "team", title: "ui.team.title", hint: "office.team.rowHint", icon: Users, href: "/office/team", show: (c) => ["owner", "admin", "agronomist", "supervisor"].includes(c.role) },
  { group: "informes", id: "reports", title: "ui.reports.title", hint: "office.reports.rowHint", icon: BarChart3, href: "/office/reports" },
  { group: "informes", id: "compare", title: "ui.compare.title", hint: "office.compare.rowHint", icon: Columns3, href: "/office/compare", show: (c) => c.farms > 1 },
  { group: "campo", id: "farms", title: "ui.common.farmsTitle", hint: "office.farms.rowHint", icon: Trees, href: "/office/farms" },
  { group: "campo", id: "dashboard", title: "ui.dash.title", hint: "office.dashboard.rowHint", icon: BarChart3, href: "/office/dashboard", show: (c) => c.role === "owner" || c.role === "admin" || c.role === "agronomist" },
  { group: "cuenta", id: "clients", title: "ui.clients.title", hint: "office.clients.rowHint", icon: Building2, href: "/office/clients", show: (c) => c.hasClients },
  // ↓ agregá las nuevas entradas debajo de esta línea (solo al final)
  { group: "campo", id: "herd", title: "office.herd.menu", hint: "office.herd.menuHint", icon: Beef, href: "/office/herd", show: (c) => !isFieldRole(c.role) && c.plots > 0 },
  { group: "campo", id: "agro", title: "office.agro.menu", hint: "office.agro.menuHint", icon: Wheat, href: "/office/agro", show: (c) => !isFieldRole(c.role) && c.farms > 0 },
  { group: "campo", id: "sanitary", title: "ui.sanitary.title", hint: "office.sanitary.menuHint", icon: HeartPulse, href: "/office/sanitary", show: (c) => !isFieldRole(c.role) && c.plots > 0 },
  { group: "campo", id: "plots", title: "office.plots.title", hint: "office.plots.rowHint", icon: Sprout, href: "/office/plots", show: (c) => c.plots > 0 },
  { group: "campo", id: "seasons", title: "ui.common.seasonsTitle", hint: "office.seasons.rowHint", icon: CalendarRange, href: "/office/seasons" },
  { group: "campo", id: "products", title: "ui.products.title", hint: "office.common.productsRowHint", icon: Package, href: "/office/products" },
  { group: "cuenta", id: "more-account", title: "office.more.accountTitle", hint: "office.more.accountHint", icon: LifeBuoy, href: "/office/more-account" },
  { group: "admin", id: "admin", title: "ui.nav.admin", hint: "office.adm.menuHint", icon: Landmark, href: "/office/admin", show: (c) => c.role === "owner" || c.role === "admin" || c.role === "agronomist" },
];
