/** Tabla de datos genérica con columnas ordenables, columnas que se ocultan en pantallas chicas y estado vacío. */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Definición de una columna de DataTable. `cell` dibuja la celda de una fila, `align` alinea el contenido y `width` fija el ancho. */
export interface Column<T> {
  id: string;
  header: ReactNode;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
  /** Con comparador, el encabezado ordena al hacer clic. */
  sort?: (a: T, b: T) => number;
  /** Oculta la columna bajo ese punto de corte. */
  hideBelow?: "sm" | "md" | "lg";
  width?: string;
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/**
 * Tabla accesible.
 * @param rowKey clave estable de cada fila.
 * @param onRowClick si se pasa, las filas son clicables.
 * @param empty contenido cuando no hay filas.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  /** Descripción para lectores de pantalla. */
  caption?: string;
}) {
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const col = sort && columns.find((c) => c.id === sort.id);
  const shown = col?.sort && sort ? [...rows].sort((a, b) => col.sort!(a, b) * sort.dir) : rows;
  if (rows.length === 0 && empty) return <>{empty}</>;
  const cell = (c: Column<T>, extra = "") =>
    `${c.align === "right" ? "num text-right" : "text-left"} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${extra}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-linea">
            {columns.map((c, i) => {
              const active = sort?.id === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={c.sort ? (active ? (sort.dir === 1 ? "ascending" : "descending") : "none") : undefined}
                  style={c.width ? { width: c.width } : undefined}
                  className={`h-10 px-3 text-meta font-medium whitespace-nowrap text-tinta-2 ${cell(c, i === 0 ? "sticky left-0 bg-lino" : "")}`}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort(active && sort.dir === -1 ? null : { id: c.id, dir: active ? -1 : 1 })}
                      className="inline-flex cursor-pointer items-center gap-1 hover:text-surco"
                    >
                      {c.header}
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className={`transition-opacity ${active ? "opacity-100" : "opacity-0"} ${active && sort.dir === 1 ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick && (() => onRowClick(r))}
              className={`group h-11 border-b border-linea ${onRowClick ? "cursor-pointer hover:bg-surco/[0.03]" : ""}`}
            >
              {columns.map((c, i) => (
                <td key={c.id} className={`px-3 ${cell(c, i === 0 ? "sticky left-0 bg-lino font-medium" : "")}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
