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

/** Nombre apto para una hoja de Excel y para un archivo: sin barras, signos de pregunta, asterisco, corchetes ni dos puntos. */
export const safeName = (s: string): string => s.replace(/[\\/?*[\]:]/g, "-").trim() || "tabla";

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
  download(new Blob(["﻿", toCsv(d)], { type: "text/csv;charset=utf-8" }), `${safeName(d.name)}-${stamp()}.csv`);
}

export async function tableToExcel(d: TableData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safeName(d.name).slice(0, 31));
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
    `${safeName(d.name)}-${stamp()}.xlsx`,
  );
}

/** Un Excel con varias hojas (una por tabla), generado en el navegador. */
export async function tablesToExcel(baseName: string, tables: TableData[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const d of tables) {
    const ws = wb.addWorksheet(safeName(d.name).slice(0, 31));
    ws.columns = d.headers.map((header, i) => ({
      header,
      key: `c${i}`,
      width: Math.min(50, Math.max(header.length + 2, ...d.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2), 10)),
    }));
    ws.getRow(1).font = { bold: true };
    // Mismo criterio que el CSV: un texto que empieza con = + - @ no se interpreta como fórmula.
    for (const r of d.rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : (v ?? ""))));
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${baseName}-${stamp()}.xlsx`);
}

/**
 * Número en formato es-PY ("1.234,5", "-12", "0,75") o null si el texto no es un número. Los textos con cero a la
 * izquierda ("0981 123", "007") y los que mezclan letras se dejan como texto: son códigos, no cantidades.
 */
export function parseEsNumber(text: string): number | null {
  const t = text.trim();
  if (!/^-?(0|[1-9]\d{0,2}(\.\d{3})+|[1-9]\d*)(,\d+)?$/.test(t)) return null;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

const cellText = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * Lee una tabla HTML ya dibujada y la pasa a TableData (U-28): encabezados de la última fila de `thead`, filas de
 * `tbody` y `tfoot`. Las columnas sin encabezado (acciones, casillas) no se exportan. Una celda con `data-value`
 * exporta ese valor en lugar del texto; los números escritos en es-PY salen como números para que Excel sume.
 */
export function tableFromElement(table: HTMLTableElement, name: string): TableData {
  const headRows = [...table.querySelectorAll("thead tr")];
  const headCells = headRows.length ? [...headRows[headRows.length - 1]!.children] : [];
  const keep = headCells.map((h, i) => (cellText(h) ? i : -1)).filter((i) => i >= 0);
  const rows: Cell[][] = [];
  for (const tr of table.querySelectorAll("tbody tr, tfoot tr")) {
    const cells = [...tr.children];
    const idx = keep.length ? keep : cells.map((_, i) => i);
    rows.push(
      idx.map((i) => {
        const c = cells[i];
        if (!c) return "";
        const raw = c.getAttribute("data-value");
        if (raw !== null) return raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
        const text = cellText(c);
        return parseEsNumber(text) ?? text;
      }),
    );
  }
  return {
    name,
    headers: (keep.length ? keep : headCells.map((_, i) => i)).map((i) => cellText(headCells[i]!)),
    rows,
  };
}

