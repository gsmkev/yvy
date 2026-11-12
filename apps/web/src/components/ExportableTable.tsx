import { useRef, type ReactNode } from "react";
import { tableFromElement } from "../lib/tableExport";
import { ExportButtons } from "./ExportButtons";

/**
 * U-28: envuelve cualquier tabla de la web y le agrega "Exportar Excel" y "Exportar CSV" con lo que se ve en
 * pantalla (mismas filas, mismo orden, columnas sin encabezado fuera). `name` es la base del nombre del archivo.
 * Uso: <ExportableTable name="hacienda"><table>…</table></ExportableTable>
 * Los botones quedan arriba a la derecha y fijos a la izquierda del recuadro si la tabla se desplaza de costado.
 */
export function ExportableTable({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <div className="sticky left-0 mb-1 flex w-full justify-end print:hidden">
        <ExportButtons
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
