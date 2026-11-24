/** Navegación de Administración: módulos y secciones que contiene cada uno. */
import type { MessageKey } from "./i18n";

interface AdminGroup {
  id: string;
  label: MessageKey;
  /** Ids de sección, en el orden en que se muestran. La primera es la que abre el módulo. */
  sections: string[];
}

/** Navegación de Administración en dos niveles: 5 módulos arriba y, debajo, las secciones del módulo activo. */
export const ADMIN_GROUPS: AdminGroup[] = [
  { id: "overview", label: "ui.admin.group_overview", sections: ["overview"] },
  { id: "trade", label: "ui.admin.group_trade", sections: ["purchases", "grain", "cattle", "parties"] },
  { id: "stock", label: "ui.admin.group_stock", sections: ["stock", "minstock", "fuel", "products", "warehouses"] },
  { id: "ops", label: "ui.admin.group_ops", sections: ["orders", "maintenance", "labor", "contractors", "feedlot", "staff", "machines"] },
  { id: "finance", label: "ui.admin.group_finance", sections: ["cash", "costs", "budget", "results", "rates", "accountant", "export"] },
];

/** Módulo al que pertenece una sección (Resumen si no se conoce). */
export const groupOf = (section: string | undefined): AdminGroup => ADMIN_GROUPS.find((g) => g.sections.includes(section ?? "")) ?? ADMIN_GROUPS[0]!;
