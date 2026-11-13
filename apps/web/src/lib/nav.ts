import { isFieldRole, type Role } from "@yvy/shared";
import type { MessageKey } from "./i18n";

export interface NavItem {
  to: string;
  label: MessageKey;
}
export interface NavGroup {
  id: string;
  /** Sin título: ítems sueltos. */
  label?: MessageKey;
  items: NavItem[];
}

export interface NavContext {
  role?: Role;
  /** Estancias de la organización; null mientras carga. */
  farms: number | null;
  /** Lotes sumando todas las estancias; null mientras carga. */
  plots: number | null;
  hasClients: boolean;
  isStaff: boolean;
  labs: boolean;
}

/**
 * Navegación agrupada. Las secciones que no aplican no se muestran:
 * Comparar con una sola estancia, Sanidad sin lotes ni hacienda, Administración para quien no administra.
 * Devuelve `main` (lo de todos los días) y `bottom` (lo que va al pie de la barra).
 */
export function buildNav(c: NavContext): { main: NavGroup[]; bottom: NavItem[] } {
  const field = !!c.role && isFieldRole(c.role);
  const admin = c.role === "owner" || c.role === "admin";
  const main: NavGroup[] = [
    {
      id: "field",
      label: "ui.navGroupField",
      items: [
        { to: "/", label: "ui.navMap" },
        { to: "/registros", label: "ui.navRecords" },
        { to: "/tareas", label: "ui.navTasks" },
        { to: "/calendario", label: "ui.navCalendar" },
      ],
    },
    {
      id: "livestock",
      label: "ui.navGroupLivestock",
      // El calendario sanitario no es para el empleado (G-10) ni tiene sentido sin lotes
      items: !field && c.plots !== 0 ? [{ to: "/sanidad", label: "ui.navSanitary" }] : [],
    },
    {
      id: "manage",
      label: "ui.navGroupManage",
      items: [
        ...(admin ? [{ to: "/administracion", label: "ui.navAdmin" as MessageKey }] : []),
        ...(!field && (c.farms ?? 0) > 1 ? [{ to: "/comparar", label: "ui.navCompare" as MessageKey }] : []),
        { to: "/equipo", label: "ui.navTeam" },
        ...(c.hasClients ? [{ to: "/clientes", label: "ui.navClients" as MessageKey }] : []),
      ],
    },
    { id: "alerts", items: [{ to: "/avisos", label: "ui.navAlerts" }] },
  ];
  return {
    main: main.filter((g) => g.items.length > 0),
    bottom: [
      ...(c.labs ? [{ to: "/laboratorio", label: "ui.navLabs" as MessageKey }] : []),
      ...(c.isStaff ? [{ to: "/interno", label: "ui.navInternal" as MessageKey }] : []),
    ],
  };
}

/** Destinos de la barra inferior del celular: el resto va en "Más". */
export const MOBILE_TABS = ["/", "/registros", "/tareas", "/avisos"] as const;
