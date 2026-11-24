/** Filas del índice de Administración (`app/office/admin.tsx`), agrupadas como los módulos de la web (`apps/web/src/lib/adminNav.ts`). */
import { Beef, BookOpen, Boxes, ClipboardList, Fuel, Handshake, Package, PackageMinus, ShoppingCart, Tractor, TrendingUp, UserCheck, Wallet, Warehouse, Wheat, Wrench, type LucideIcon } from "lucide-react-native";
import type { MessageKey } from "@yvy/shared";

type AdminGroup = "trade" | "stock" | "ops" | "finance";
/** Grupos del menú de Administración, en orden. */
export const ADMIN_GROUPS: AdminGroup[] = ["trade", "stock", "ops", "finance"];

/** Título de cada grupo de Administración. */
export const ADMIN_GROUP_TITLE: Record<AdminGroup, MessageKey> = {
  trade: "ui.admin.group_trade",
  stock: "ui.admin.group_stock",
  ops: "ui.admin.group_ops",
  finance: "ui.admin.group_finance",
};

interface AdminMenuCtx {
  /** Dueño o administrador (`can.manageErp`). */
  manage: boolean;
  /** Dueño, administrador o agrónomo (`can.viewStock`: cantidades, nunca montos). */
  stock: boolean;
}

interface AdminMenuItem {
  group: AdminGroup;
  /** Único. */
  id: string;
  title: MessageKey;
  hint?: MessageKey;
  icon: LucideIcon;
  /** Ruta de expo-router, p. ej. "/office/admin/purchases". */
  href: string;
  /** Si falta, solo dueño y administrador la ven. */
  show?: (ctx: AdminMenuCtx) => boolean;
}

const stockToo = (c: AdminMenuCtx) => c.stock;

/**
 * PARA AGREGAR UNA FILA: añadila AL FINAL de su grupo (con Edit puntual) y creá la pantalla en `app/office/admin/<id>.tsx`.
 * `admin1` carga trade y stock; `admin2` carga ops y finance. Los grupos sin filas visibles no se muestran.
 */
export const ADMIN_MENU: AdminMenuItem[] = [
  // ---- trade (Compras y ventas) ----
  { group: "trade", id: "purchases", title: "ui.admin.section_purchases", hint: "office.adm.purchasesHint", icon: ShoppingCart, href: "/office/admin/purchases" },
  { group: "trade", id: "grain", title: "ui.admin.section_grain", hint: "office.adm.grainHint", icon: Wheat, href: "/office/admin/grain" },
  { group: "trade", id: "cattle", title: "ui.admin.section_cattle", hint: "office.adm.cattleHint", icon: Beef, href: "/office/admin/cattle" },
  { group: "trade", id: "parties", title: "ui.admin.section_parties", hint: "office.adm.partiesHint", icon: Handshake, href: "/office/admin/parties" },
  // ---- stock ----
  { group: "stock", id: "stock", title: "ui.admin.section_stock", hint: "office.adm.stockHint", icon: Boxes, href: "/office/admin/stock", show: stockToo },
  { group: "stock", id: "minstock", title: "ui.admin.section_minstock", hint: "office.adm.minStockHint", icon: PackageMinus, href: "/office/admin/min-stock", show: stockToo },
  { group: "stock", id: "fuel", title: "ui.admin.section_fuel", hint: "office.adm.fuelHint", icon: Fuel, href: "/office/admin/fuel", show: stockToo },
  { group: "stock", id: "products", title: "ui.admin.section_products", hint: "office.adm.productsHint", icon: Package, href: "/office/products", show: stockToo },
  { group: "stock", id: "warehouses", title: "ui.admin.section_warehouses", hint: "office.adm.warehousesHint", icon: Warehouse, href: "/office/admin/warehouses", show: stockToo },
  // ---- ops (Operación) ----
  { group: "ops", id: "machines", title: "ui.admin.section_machines", hint: "office.adm.machinesHint", icon: Tractor, href: "/office/admin/machines", show: stockToo },
  { group: "ops", id: "orders", title: "ui.admin.section_orders", hint: "office.adm.hint_orders", icon: ClipboardList, href: "/office/admin/ops/orders" },
  { group: "ops", id: "maintenance", title: "ui.admin.section_maintenance", hint: "office.adm.hint_maintenance", icon: Wrench, href: "/office/admin/ops/maintenance" },
  { group: "ops", id: "staff", title: "ui.admin.section_staff", hint: "office.adm.hint_staff", icon: UserCheck, href: "/office/admin/ops/staff" },
  // ---- finance (Finanzas) ----
  { group: "finance", id: "cash", title: "ui.admin.section_cash", hint: "office.adm.hint_cash", icon: Wallet, href: "/office/admin/finance/cash" },
  { group: "finance", id: "costs", title: "ui.admin.section_costs", hint: "office.adm.hint_costs", icon: BookOpen, href: "/office/admin/finance/costs" },
  { group: "finance", id: "results", title: "ui.admin.section_results", hint: "office.adm.hint_results", icon: TrendingUp, href: "/office/admin/finance/results" },
];
