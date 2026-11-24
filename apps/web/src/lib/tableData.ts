/** Forma de una tabla simple exportable (Excel/CSV). */

/** Valor de una celda exportable; null y undefined salen vacíos. */
export type Cell = string | number | null | undefined;
/** Tabla simple exportable: nombre, encabezados y filas de texto. */
export interface TableData {
  /** Nombre de la hoja y base del archivo. */
  name: string;
  headers: string[];
  rows: Cell[][];
}
