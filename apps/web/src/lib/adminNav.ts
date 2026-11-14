import type { MessageKey } from "./i18n";

export interface AdminGroup {
  id: string;
  label: MessageKey;
  /** Ids de sección, en el orden en que se muestran. */
  sections: string[];
}

/** Navegación secundaria de Administración: 23 secciones en 7 grupos, para no tener una fila de pestañas que se corta. */
export const ADMIN_GROUPS: AdminGroup[] = [
  { id: "catalog", label: "ui.adminGroup_catalog", sections: ["products", "warehouses", "machines"] },
  { id: "trade", label: "ui.adminGroup_trade", sections: ["parties", "purchases", "grain", "cattle"] },
  { id: "stock", label: "ui.adminGroup_stock", sections: ["stock", "minstock", "fuel"] },
  { id: "ops", label: "ui.adminGroup_ops", sections: ["orders", "maintenance", "labor", "contractors", "feedlot"] },
  { id: "finance", label: "ui.adminGroup_finance", sections: ["cash", "costs", "budget", "results", "rates"] },
  { id: "people", label: "ui.adminGroup_people", sections: ["staff"] },
  { id: "accountant", label: "ui.adminGroup_accountant", sections: ["accountant", "export"] },
];
