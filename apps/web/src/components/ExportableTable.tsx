import { useRef, type ReactNode } from "react";
import { tableFromElement } from "../lib/tableExport";
import { TableExportMenu } from "./TableExportMenu";

/**
 * U-28: envuelve cualquier tabla de la web y le agrega un solo menú "Exportar" (Excel y CSV) con lo que se ve en
 * pantalla (mismas filas, mismo orden, columnas sin encabezado fuera). `name` es la base del nombre del archivo.
 * Uso: <ExportableTable name="hacienda"><table>…</table></ExportableTable>
 * El menú queda arriba a la derecha y fijos a la izquierda del recuadro si la tabla se desplaza de costado.
 */
export function ExportableTable({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <div className="sticky left-0 flex w-full justify-end print:hidden">
        <TableExportMenu
          data={() => {
            const table = ref.current?.querySelector("table");
            if (!table) return { name, headers: [], rows: [] };
            return tableFromElement(table, name);
          }}
        />
      </div>
      {children}
    </div>
  );
}
