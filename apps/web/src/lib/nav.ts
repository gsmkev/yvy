/** Definición de la navegación principal: grupos y entradas del menú según el rol, la cantidad de estancias y las funciones disponibles. */
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

/** Entrada del menú: ruta, texto e ícono. */
export interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
}
/** Grupo de entradas del menú; sin `label` son entradas sueltas. */
export interface NavGroup {
  id: string;
  /** Sin título: ítems sueltos. */
  label?: MessageKey;
  items: NavItem[];
}

/** Datos que deciden qué entradas se muestran: rol, cantidad de estancias y de lotes (null mientras cargan) y banderas de funciones. */
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
      label: "ui.nav.groupField",
      items: [
        { to: "/", label: "ui.nav.map", icon: Map },
        { to: "/registros", label: "ui.nav.records", icon: ClipboardList },
        { to: "/tareas", label: "ui.nav.tasks", icon: ListChecks },
        { to: "/calendario", label: "ui.nav.calendar", icon: CalendarDays },
        // El calendario sanitario no es para el empleado ni tiene sentido sin lotes
        ...(!field && c.plots !== 0 ? [{ to: "/sanidad", label: "ui.nav.sanitary" as MessageKey, icon: HeartPulse }] : []),
        { to: "/avisos", label: "ui.nav.alerts", icon: Bell },
      ],
    },
    {
      id: "manage",
      label: "ui.nav.groupManage",
      items: [
        // Informes vive dentro de cada estancia: el ítem lleva a la última mirada (o la primera)
        ...(!field && (c.farms ?? 0) > 0 ? [{ to: "/informes", label: "ui.reports.title" as MessageKey, icon: FileText }] : []),
        ...(admin ? [{ to: "/administracion", label: "ui.nav.admin" as MessageKey, icon: Wallet }] : []),
        { to: "/equipo", label: "ui.nav.team", icon: Users },
        ...(!field && (c.farms ?? 0) > 1 ? [{ to: "/comparar", label: "ui.nav.compare" as MessageKey, icon: GitCompareArrows }] : []),
        ...(c.hasClients ? [{ to: "/clientes", label: "ui.nav.clients" as MessageKey, icon: Briefcase }] : []),
      ],
    },
  ];
  return {
    main: main.filter((g) => g.items.length > 0),
    bottom: [
      ...(c.labs ? [{ to: "/laboratorio", label: "ui.nav.labs" as MessageKey, icon: FlaskConical }] : []),
      ...(c.isStaff ? [{ to: "/interno", label: "ui.nav.internal" as MessageKey, icon: Shield }] : []),
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
