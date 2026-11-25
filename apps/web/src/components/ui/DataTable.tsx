/** Tabla de datos genérica con columnas ordenables, estado vacío y, bajo 640 px, lista de tarjetas en lugar de tabla. */
import { isValidElement, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useIsPhone } from "./useMediaQuery";

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
  /**
   * Papel de la columna en la tarjeta del celular: "title" (la primera por defecto), "value" (el dato clave a la derecha;
   * por defecto la última columna alineada a la derecha), "hide" (no se muestra). El resto va en una línea secundaria.
   * Las columnas con `hideBelow` ya se ocultan en la tarjeta, y la de acciones (encabezado `<span className="sr-only">`) va al final.
   */
  mobile?: "title" | "value" | "hide";
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/**
 * Tabla accesible. Bajo 640 px dibuja cada fila como tarjeta (título, dato clave a la derecha y una línea secundaria)
 * y deja la tabla oculta en el documento para que la exportación siga leyéndola.
 * @param rowKey clave estable de cada fila.
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
  /** Si se pasa, las filas son clicables. */
onRowClick?: (row: T) => void;
  /** Contenido cuando no hay filas. */
empty?: ReactNode;
  /** Descripción para lectores de pantalla. */
  caption?: string;
}) {
  const phone = useIsPhone();
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const col = sort && columns.find((c) => c.id === sort.id);
  const shown = col?.sort && sort ? [...rows].sort((a, b) => col.sort!(a, b) * sort.dir) : rows;
  if (rows.length === 0 && empty) return <>{empty}</>;
  const cell = (c: Column<T>, extra = "") =>
    `${c.align === "right" ? "num text-right" : "text-left"} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${extra}`;
  const table = (
    <div className={phone ? "hidden" : "overflow-x-auto"} aria-hidden={phone || undefined}>
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
  if (!phone) return table;
  const isAction = (c: Column<T>) => isValidElement<{ className?: string }>(c.header) && c.header.props.className === "sr-only";
  const visible = columns.filter((c) => !c.hideBelow && c.mobile !== "hide");
  const body = visible.filter((c) => !isAction(c));
  const actions = visible.find(isAction);
  const title = body.find((c) => c.mobile === "title") ?? body[0];
  const value = body.find((c) => c.mobile === "value") ?? [...body].reverse().find((c) => c.align === "right" && c !== title);
  const rest = body.filter((c) => c !== title && c !== value);
  return (
    <>
      {caption && <p className="sr-only">{caption}</p>}
      <ul className="divide-y divide-linea border-y border-linea">
        {shown.map((r) => (
          <li
            key={rowKey(r)}
            onClick={onRowClick && (() => onRowClick(r))}
            className={`flex items-start gap-3 py-3 ${onRowClick ? "cursor-pointer active:bg-surco/[0.03]" : ""}`}
          >
            <div className="min-w-0 flex-1">
              {title && <div className="text-sm font-medium break-words">{title.cell(r)}</div>}
              {rest.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-meta text-tinta-2">
                  {rest.map((c) => (
                    <span key={c.id} className="break-words">
                      {c.cell(r)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {value && <div className="num max-w-[45%] shrink-0 text-right text-sm font-medium break-words">{value.cell(r)}</div>}
            {actions && <div className="-my-1 -mr-2 shrink-0">{actions.cell(r)}</div>}
          </li>
        ))}
      </ul>
      {table}
    </>
  );
}
