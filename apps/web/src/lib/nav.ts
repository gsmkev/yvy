import { isFieldRole, type Role } from "@yvy/shared";
import {
  Bell,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  GitCompareArrows,
  HeartPulse,
  ListChecks,
  Map,
  Shield,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "./i18n";

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
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
 * Devuelve `main` (Campo y Gestión) y `bottom` (lo que va al pie de la barra). "/informes" es un destino virtual: el Layout lo resuelve a la estancia.
 */
export function buildNav(c: NavContext): { main: NavGroup[]; bottom: NavItem[] } {
  const field = !!c.role && isFieldRole(c.role);
  const admin = c.role === "owner" || c.role === "admin";
  const main: NavGroup[] = [
    {
      id: "field",
      label: "ui.navGroupField",
      items: [
        { to: "/", label: "ui.navMap", icon: Map },
        { to: "/registros", label: "ui.navRecords", icon: ClipboardList },
        { to: "/tareas", label: "ui.navTasks", icon: ListChecks },
        { to: "/calendario", label: "ui.navCalendar", icon: CalendarDays },
        // El calendario sanitario no es para el empleado (G-10) ni tiene sentido sin lotes
        ...(!field && c.plots !== 0 ? [{ to: "/sanidad", label: "ui.navSanitary" as MessageKey, icon: HeartPulse }] : []),
        { to: "/avisos", label: "ui.navAlerts", icon: Bell },
      ],
    },
    {
      id: "manage",
      label: "ui.navGroupManage",
      items: [
        // Informes vive dentro de cada estancia: el ítem lleva a la última mirada (o la primera)
        ...(!field && (c.farms ?? 0) > 0 ? [{ to: "/informes", label: "ui.reportsTitle" as MessageKey, icon: FileText }] : []),
        ...(admin ? [{ to: "/administracion", label: "ui.navAdmin" as MessageKey, icon: Wallet }] : []),
        { to: "/equipo", label: "ui.navTeam", icon: Users },
        ...(!field && (c.farms ?? 0) > 1 ? [{ to: "/comparar", label: "ui.navCompare" as MessageKey, icon: GitCompareArrows }] : []),
        ...(c.hasClients ? [{ to: "/clientes", label: "ui.navClients" as MessageKey, icon: Briefcase }] : []),
      ],
    },
  ];
  return {
    main: main.filter((g) => g.items.length > 0),
    bottom: [
      ...(c.labs ? [{ to: "/laboratorio", label: "ui.navLabs" as MessageKey, icon: FlaskConical }] : []),
      ...(c.isStaff ? [{ to: "/interno", label: "ui.navInternal" as MessageKey, icon: Shield }] : []),
    ],
  };
}

/** Destinos de la barra inferior del celular: el resto va en "Más". */
export const MOBILE_TABS = ["/", "/registros", "/tareas", "/avisos"] as const;

/** Pantallas de informes de una estancia: parte, riesgo, EUDR, cambios, pluviómetros y el centro de informes. */
export function isReportsPath(path: string): boolean {
  return /^\/estancias\/[^/]+\/(informes|parte|riesgo|eudr|cambios|pluviometros)(\/|$)/.test(path);
}

/** "Mapa" es la raíz y la estancia, salvo sus pantallas de informes. */
export function isMapPath(path: string): boolean {
  return path === "/" || (path.startsWith("/estancias") && !isReportsPath(path));
}
