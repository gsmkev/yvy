import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useExportSlot } from "./ui";
import { tableFromElement } from "../lib/tableExport";
import { TableExportMenu } from "./TableExportMenu";

/**
 * Envuelve cualquier tabla de la web y le agrega un solo menú "Exportar" (Excel y CSV) con lo que se ve en
 * pantalla (mismas filas, mismo orden, columnas sin encabezado fuera). `name` es la base del nombre del archivo.
 * Uso: <ExportableTable name="hacienda"><table>…</table></ExportableTable>
 * El menú se acomoda al final de la `FilterBar` de la pantalla (un solo "Exportar" junto a los filtros); sin barra,
 * queda arriba a la derecha de la tabla.
 */
export function ExportableTable({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const slot = useExportSlot();
  const menu = (
    <TableExportMenu
      data={() => {
        const table = ref.current?.querySelector("table");
        if (!table) return { name, headers: [], rows: [] };
        return tableFromElement(table, name);
      }}
    />
  );
  return (
    <div ref={ref}>
      {slot ? createPortal(menu, slot) : <div className="flex w-full justify-end print:hidden">{menu}</div>}
      {children}
    </div>
  );
}
