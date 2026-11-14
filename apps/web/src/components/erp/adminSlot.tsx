/**
 * Encabezado de la sección de Administración: cada panel declara su primario y su menú con `HeaderActions`
 * y la página los muestra junto al título (un primario por pantalla). Fuera de Administración
 * (por ejemplo Productos en la ficha de la estancia) se dibujan en el lugar.
 */
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** null: no hay encabezado de Administración. `{ el: null }`: todavía no se montó. */
export const AdminSlotContext = createContext<{ el: HTMLElement | null } | null>(null);

export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(AdminSlotContext);
  if (!slot) return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  return slot.el ? createPortal(children, slot.el) : null;
}

export { RowMenu } from "../menus";
