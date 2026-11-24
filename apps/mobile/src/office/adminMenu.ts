/** Filas del índice de Administración (`app/office/admin.tsx`), agrupadas como los módulos de la web (`apps/web/src/lib/adminNav.ts`). */
import { Beef, BookOpen, Boxes, ClipboardList, Fuel, Handshake, Package, PackageMinus, ShoppingCart, Tractor, TrendingUp, UserCheck, Wallet, Warehouse, Wheat, Wrench, type LucideIcon } from "lucide-react-native";
import type { MessageKey } from "@yvy/shared";

type AdminGroup = "trade" | "stock" | "ops" | "finance";
export const ADMIN_GROUPS: AdminGroup[] = ["trade", "stock", "ops", "finance"];

export const ADMIN_GROUP_TITLE: Record<AdminGroup, MessageKey> = {
  trade: "ui.adminGroup_trade",
  stock: "ui.adminGroup_stock",
  ops: "ui.adminGroup_ops",
  finance: "ui.adminGroup_finance",
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
  { group: "trade", id: "purchases", title: "ui.adminSection_purchases", hint: "office.admPurchasesHint", icon: ShoppingCart, href: "/office/admin/purchases" },
  { group: "trade", id: "grain", title: "ui.adminSection_grain", hint: "office.admGrainHint", icon: Wheat, href: "/office/admin/grain" },
  { group: "trade", id: "cattle", title: "ui.adminSection_cattle", hint: "office.admCattleHint", icon: Beef, href: "/office/admin/cattle" },
  { group: "trade", id: "parties", title: "ui.adminSection_parties", hint: "office.admPartiesHint", icon: Handshake, href: "/office/admin/parties" },
  // ---- stock ----
  { group: "stock", id: "stock", title: "ui.adminSection_stock", hint: "office.admStockHint", icon: Boxes, href: "/office/admin/stock", show: stockToo },
  { group: "stock", id: "minstock", title: "ui.adminSection_minstock", hint: "office.admMinStockHint", icon: PackageMinus, href: "/office/admin/min-stock", show: stockToo },
  { group: "stock", id: "fuel", title: "ui.adminSection_fuel", hint: "office.admFuelHint", icon: Fuel, href: "/office/admin/fuel", show: stockToo },
  { group: "stock", id: "products", title: "ui.adminSection_products", hint: "office.admProductsHint", icon: Package, href: "/office/products", show: stockToo },
  { group: "stock", id: "warehouses", title: "ui.adminSection_warehouses", hint: "office.admWarehousesHint", icon: Warehouse, href: "/office/admin/warehouses", show: stockToo },
  // ---- ops (Operación) ----
  { group: "ops", id: "machines", title: "ui.adminSection_machines", hint: "office.admMachinesHint", icon: Tractor, href: "/office/admin/machines", show: stockToo },
  { group: "ops", id: "orders", title: "ui.adminSection_orders", hint: "office.admHint_orders", icon: ClipboardList, href: "/office/admin/ops/orders" },
  { group: "ops", id: "maintenance", title: "ui.adminSection_maintenance", hint: "office.admHint_maintenance", icon: Wrench, href: "/office/admin/ops/maintenance" },
  { group: "ops", id: "staff", title: "ui.adminSection_staff", hint: "office.admHint_staff", icon: UserCheck, href: "/office/admin/ops/staff" },
  // ---- finance (Finanzas) ----
  { group: "finance", id: "cash", title: "ui.adminSection_cash", hint: "office.admHint_cash", icon: Wallet, href: "/office/admin/finance/cash" },
  { group: "finance", id: "costs", title: "ui.adminSection_costs", hint: "office.admHint_costs", icon: BookOpen, href: "/office/admin/finance/costs" },
  { group: "finance", id: "results", title: "ui.adminSection_results", hint: "office.admHint_results", icon: TrendingUp, href: "/office/admin/finance/results" },
];
