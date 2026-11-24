/** Forma de una tabla simple exportable (Excel/CSV). */
export type Cell = string | number | null | undefined;
export interface TableData {
  /** Nombre de la hoja y base del archivo. */
  name: string;
  headers: string[];
  rows: Cell[][];
}
