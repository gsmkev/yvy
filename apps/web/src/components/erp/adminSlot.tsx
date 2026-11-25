/**
 * Encabezado de la sección de Administración: cada panel declara su primario y su menú con `HeaderActions`
 * y la página los muestra junto al título (un primario por pantalla). Fuera de Administración
 * (por ejemplo Productos en la ficha de la estancia) se dibujan en el lugar.
 */
import { createContext, useContext, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { tableFromElement } from "../../lib/tableExport";
import { TableExportMenu } from "../TableExportMenu";
import { useExportSlot } from "../ui";

/** null: no hay encabezado de Administración. `{ el: null }`: todavía no se montó. */
export const AdminSlotContext = createContext<{ el: HTMLElement | null } | null>(null);

/** Muestra sus hijos en el encabezado de Administración; fuera de ella los dibuja en el lugar. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(AdminSlotContext);
  if (!slot) return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  return slot.el ? createPortal(children, slot.el) : null;
}

/** Menú de acciones de una fila (reexportado de menus). */
export { RowMenu } from "../menus";

/**
 * Un solo "Exportar" por panel, junto a los filtros (o en el encabezado si no hay barra): exporta la tabla que se ve dentro de `ref`.
 * Uso: `const exp = useTableExport("compras")`; `<div ref={exp.ref}><DataTable …/></div>` y `{rows.length > 0 && exp.menu}`.
 */
export function useTableExport(name: string) {
  const ref = useRef<HTMLDivElement>(null);
  const slot = useExportSlot();
  const button = (
    <TableExportMenu
      data={() => {
        const table = ref.current?.querySelector("table");
        return table ? tableFromElement(table, name) : { name, headers: [], rows: [] };
      }}
    />
  );
  // Junto a los filtros si la pantalla tiene barra; si no, en el encabezado de Administración
  const menu = slot ? createPortal(button, slot) : <HeaderActions>{button}</HeaderActions>;
  return { ref, menu };
}

/** Va a otra sección de Administración (los requisitos previos son un botón, no un texto). */
export function useGoSection() {
  const navigate = useNavigate();
  return (id: string) => void navigate({ to: "/administracion", search: { s: id } });
}
