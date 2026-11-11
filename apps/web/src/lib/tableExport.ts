/** Exportación de tablas simples a Excel y CSV, generadas en el navegador. */
import { download } from "./exports";

export type Cell = string | number | null | undefined;
export interface TableData {
  /** Nombre de la hoja y base del archivo. */
  name: string;
  headers: string[];
  rows: Cell[][];
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Evita que Excel interprete texto como fórmula (=, +, -, @) y escapa comillas. */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const toCsv = (d: TableData): string => [d.headers, ...d.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

export function tableToCsv(d: TableData) {
  // BOM para que Excel abra bien las tildes
  download(new Blob(["﻿", toCsv(d)], { type: "text/csv;charset=utf-8" }), `${d.name}-${stamp()}.csv`);
}

export async function tableToExcel(d: TableData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(d.name.slice(0, 31));
  ws.columns = d.headers.map((header, i) => ({
    header,
    key: `c${i}`,
    width: Math.min(50, Math.max(header.length + 2, ...d.rows.map((r) => String(r[i] ?? "").length + 2), 10)),
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of d.rows) ws.addRow(r.map((v) => v ?? ""));
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${d.name}-${stamp()}.xlsx`,
  );
}
