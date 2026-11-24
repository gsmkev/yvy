/** Lógica pura del menú de Gestión (sin íconos ni React): tipos, filtrado por contexto y agrupado. */
import type { LucideIcon } from "lucide-react-native";
import type { MessageKey } from "@yvy/shared";

/** Grupo del menú de Gestión. */
export type MenuGroup = "campo" | "equipo" | "admin" | "informes" | "cuenta";
const MENU_GROUPS: MenuGroup[] = ["campo", "equipo", "admin", "informes", "cuenta"];

/** Título de cada grupo del menú. */
export const GROUP_TITLE: Record<MenuGroup, MessageKey> = {
  campo: "office.group.campo",
  equipo: "office.group.equipo",
  admin: "office.group.admin",
  informes: "office.group.informes",
  cuenta: "office.group.cuenta",
};

/** Contexto con el que se decide qué entradas se muestran. */
export interface MenuCtx {
  role: string;
  /** Estancias y lotes que bajaron al celular. */
  farms: number;
  plots: number;
  /** ¿Pertenece a más de una organización (agrónomo con clientes)? */
  hasClients: boolean;
}

/** Entrada del menú de Gestión. */
export interface OfficeMenuItem {
  group: MenuGroup;
  /** Único. */
  id: string;
  title: MessageKey;
  hint?: MessageKey;
  icon: LucideIcon;
  /** Ruta de expo-router, p. ej. "/office/alerts". */
  href: string;
  /** Si falta, se muestra siempre (la pestaña ya es solo para roles de oficina). */
  show?: (ctx: MenuCtx) => boolean;
}

/** Entradas visibles para este contexto, por grupo y sin grupos vacíos; respeta el orden de MENU_GROUPS y del arreglo. */
export function groupMenu(items: OfficeMenuItem[], ctx: MenuCtx): { group: MenuGroup; items: OfficeMenuItem[] }[] {
  return MENU_GROUPS.map((group) => ({ group, items: items.filter((i) => i.group === group && (!i.show || i.show(ctx))) })).filter((g) => g.items.length > 0);
}
