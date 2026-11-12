/**
 * Exportación para sistemas contables locales (I-06): compras, ventas y caja en texto delimitado con formato
 * configurable (columnas, separador, formato de fecha y de números) y plantillas para el libro IVA de Paraguay.
 * Todo puro: el Worker entrega filas (JSON) y el texto se arma en el navegador.
 */
import { z } from "zod";
import { fromMinor, type Currency } from "./erp";
import { LIMITS } from "./limits";

export const EXPORT_DATASETS = ["purchases", "sales", "cash"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export const TAX_DOC_KINDS = ["purchase", "settlement", "cattle"] as const;
export type TaxDocKind = (typeof TAX_DOC_KINDS)[number];

export const SEPARATORS = { comma: ",", semicolon: ";", tab: "\t", pipe: "|" } as const;
export type SeparatorKey = keyof typeof SEPARATORS;
export const DATE_FORMATS = ["iso", "dmy_slash", "dmy_dash", "ymd_compact"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Una fila de compras o ventas: un documento con su tercero, su número y el desglose de IVA si se cargó. */
export interface ExportDoc {
  docKind: TaxDocKind;
  docId: string;
  /** "AAAA-MM-DD". */
  date: string;
  number: string | null;
  concept: string;
  party: string;
  ruc: string;
  currency: Currency;
  /** Importe en unidad menor de `currency`. */
  amountMinor: number;
  amountPyg: number;
  dueDate: string | null;
  timbrado: string | null;
  /** Gravadas con IVA incluido y exentas, en guaraníes; null mientras no se cargó el desglose. */
  gross10: number | null;
  gross5: number | null;
  exempt: number | null;
}
/** Un movimiento de caja o banco. `amountMinor` es con signo: entrada positiva, salida negativa. */
export interface ExportCashMove {
  date: string;
  account: string;
  currency: Currency;
  description: string;
  party: string;
  ruc: string;
  docKind: string;
  amountMinor: number;
}

export type ColumnKind = "text" | "date" | "money" | "pyg";
export interface ColumnDef {
  key: string;
  kind: ColumnKind;
  /** Rótulo por defecto (es-PY). */
  label: string;
}

const DOC_COLUMNS: ColumnDef[] = [
  { key: "date", kind: "date", label: "Fecha" },
  { key: "number", kind: "text", label: "N° de factura" },
  { key: "timbrado", kind: "text", label: "Timbrado" },
  { key: "ruc", kind: "text", label: "RUC" },
  { key: "party", kind: "text", label: "Razón social" },
  { key: "concept", kind: "text", label: "Concepto" },
  { key: "currency", kind: "text", label: "Moneda" },
  { key: "amount", kind: "money", label: "Importe" },
  { key: "amountPyg", kind: "pyg", label: "Importe en guaraníes" },
  { key: "gross10", kind: "pyg", label: "Gravadas 10 %" },
  { key: "gross5", kind: "pyg", label: "Gravadas 5 %" },
  { key: "exempt", kind: "pyg", label: "Exentas" },
  { key: "vat10", kind: "pyg", label: "IVA 10 %" },
  { key: "vat5", kind: "pyg", label: "IVA 5 %" },
  { key: "total", kind: "pyg", label: "Total" },
  { key: "dueDate", kind: "date", label: "Vencimiento" },
];
const CASH_COLUMNS: ColumnDef[] = [
  { key: "date", kind: "date", label: "Fecha" },
  { key: "account", kind: "text", label: "Cuenta" },
  { key: "currency", kind: "text", label: "Moneda" },
  { key: "description", kind: "text", label: "Descripción" },
  { key: "ruc", kind: "text", label: "RUC" },
  { key: "party", kind: "text", label: "Tercero" },
  { key: "docKind", kind: "text", label: "Documento" },
  { key: "income", kind: "money", label: "Entrada" },
  { key: "outflow", kind: "money", label: "Salida" },
  { key: "amount", kind: "money", label: "Importe con signo" },
];
/** Columnas disponibles de cada conjunto de datos. */
export const EXPORT_COLUMNS: Record<ExportDataset, ColumnDef[]> = { purchases: DOC_COLUMNS, sales: DOC_COLUMNS, cash: CASH_COLUMNS };

export const exportConfigSchema = z.object({
  separator: z.enum(["comma", "semicolon", "tab", "pipe"]),
  dateFormat: z.enum(DATE_FORMATS),
  /** Separador decimal y de miles; los guaraníes no llevan decimales. */
  decimal: z.enum([".", ","]),
  thousands: z.enum(["", ".", ",", " "]),
  header: z.boolean(),
  /** Marca de orden de bytes UTF-8, que Excel necesita para leer bien las tildes. */
  bom: z.boolean(),
  quoteAll: z.boolean().default(false),
  columns: z
    .array(z.object({ key: z.string().min(1).max(30), label: z.string().trim().min(1).max(60) }))
    .min(1)
    .max(LIMITS.exportFormat.maxColumns),
});
export type ExportConfig = z.infer<typeof exportConfigSchema>;

export const exportFormatInput = z.object({
  name: z.string().trim().min(1).max(80),
  dataset: z.enum(EXPORT_DATASETS),
  config: exportConfigSchema,
});

const col = (dataset: ExportDataset, key: string, label?: string) => ({ key, label: label ?? EXPORT_COLUMNS[dataset].find((c) => c.key === key)?.label ?? key });

/**
 * Plantilla del libro IVA de Paraguay: fecha, RUC, razón social, timbrado, número de factura, gravadas 10 % y 5 %,
 * exentas, IVA y total, con ";" de separador, fecha dd/mm/aaaa y guaraníes sin separador de miles.
 */
export const libroIvaConfig = (dataset: "purchases" | "sales"): ExportConfig => ({
  separator: "semicolon",
  dateFormat: "dmy_slash",
  decimal: ",",
  thousands: "",
  header: true,
  bom: true,
  quoteAll: false,
  columns: [
    col(dataset, "date"),
    col(dataset, "ruc", "RUC"),
    col(dataset, "party", dataset === "purchases" ? "Proveedor" : "Cliente"),
    col(dataset, "timbrado"),
    col(dataset, "number", "N° de factura"),
    col(dataset, "gross10"),
    col(dataset, "gross5"),
    col(dataset, "exempt"),
    col(dataset, "vat10"),
    col(dataset, "vat5"),
    col(dataset, "total"),
  ],
});

/** Formato inicial de un conjunto de datos: todas las columnas, ";" y fecha dd/mm/aaaa. */
export const defaultExportConfig = (dataset: ExportDataset): ExportConfig => ({
  separator: "semicolon",
  dateFormat: "dmy_slash",
  decimal: ",",
  thousands: "",
  header: true,
  bom: true,
  quoteAll: false,
  columns: EXPORT_COLUMNS[dataset].map((c) => ({ key: c.key, label: c.label })),
});

export const EXPORT_PRESETS = [
  { id: "libro_iva_compras", dataset: "purchases", config: () => libroIvaConfig("purchases") },
  { id: "libro_iva_ventas", dataset: "sales", config: () => libroIvaConfig("sales") },
] as const;

// ---------- Formato de valores ----------

export function formatExportDate(iso: string | null, f: DateFormat): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-") as [string, string, string];
  return f === "iso" ? `${y}-${m}-${d}` : f === "dmy_slash" ? `${d}/${m}/${y}` : f === "dmy_dash" ? `${d}-${m}-${y}` : `${y}${m}${d}`;
}

/** Número con los separadores pedidos; `decimals` en 0 redondea. */
export function formatExportNumber(n: number, c: Pick<ExportConfig, "decimal" | "thousands">, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".") as [string, string | undefined];
  const grouped = c.thousands ? int.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousands) : int;
  return `${n < 0 && Number(`${int}.${frac ?? 0}`) !== 0 ? "-" : ""}${grouped}${frac ? c.decimal + frac : ""}`;
}

const MINOR_DECIMALS: Record<Currency, number> = { PYG: 0, USD: 2 };

/** IVA incluido en un importe gravado: la décima parte del total más uno (10 %) o la vigésima primera (5 %). */
export const vatIncluded = (gross: number, rate: 10 | 5): number => Math.round(gross / (rate === 10 ? 11 : 21));

/** Valor crudo de una columna de un documento (antes de dar formato). */
function docValue(d: ExportDoc, key: string): string | number | null {
  switch (key) {
    case "date":
      return d.date;
    case "number":
      return d.number;
    case "timbrado":
      return d.timbrado;
    case "ruc":
      return d.ruc;
    case "party":
      return d.party;
    case "concept":
      return d.concept;
    case "currency":
      return d.currency;
    case "amount":
      return fromMinor(d.amountMinor, d.currency);
    case "amountPyg":
      return d.amountPyg;
    case "gross10":
      return d.gross10;
    case "gross5":
      return d.gross5;
    case "exempt":
      return d.exempt;
    case "vat10":
      return d.gross10 === null ? null : vatIncluded(d.gross10, 10);
    case "vat5":
      return d.gross5 === null ? null : vatIncluded(d.gross5, 5);
    // Sin desglose de IVA, el total es el importe del documento en guaraníes.
    case "total":
      return d.gross10 === null && d.gross5 === null && d.exempt === null ? d.amountPyg : (d.gross10 ?? 0) + (d.gross5 ?? 0) + (d.exempt ?? 0);
    case "dueDate":
      return d.dueDate;
    default:
      return null;
  }
}

function cashValue(m: ExportCashMove, key: string): string | number | null {
  switch (key) {
    case "date":
      return m.date;
    case "account":
      return m.account;
    case "currency":
      return m.currency;
    case "description":
      return m.description;
    case "ruc":
      return m.ruc;
    case "party":
      return m.party;
    case "docKind":
      return m.docKind;
    case "income":
      return m.amountMinor > 0 ? fromMinor(m.amountMinor, m.currency) : null;
    case "outflow":
      return m.amountMinor < 0 ? fromMinor(-m.amountMinor, m.currency) : null;
    case "amount":
      return fromMinor(m.amountMinor, m.currency);
    default:
      return null;
  }
}

const quote = (v: string, sep: string, all: boolean, text = false) => {
  // Un texto que empieza con = + - @ no se interpreta como fórmula en Excel (los números y fechas no pasan por acá).
  const safe = text && /^[=+\-@]/.test(v) ? `'${v}` : v;
  return all || /["\r\n]/.test(safe) || safe.includes(sep) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Texto delimitado de un conjunto de datos con el formato elegido. Las columnas desconocidas salen vacías. */
export function renderExport(dataset: ExportDataset, rows: (ExportDoc | ExportCashMove)[], cfg: ExportConfig): string {
  const defs = new Map(EXPORT_COLUMNS[dataset].map((c) => [c.key, c]));
  const sep = SEPARATORS[cfg.separator];
  const get = (r: ExportDoc | ExportCashMove, key: string) => (dataset === "cash" ? cashValue(r as ExportCashMove, key) : docValue(r as ExportDoc, key));
  const lines: string[] = [];
  if (cfg.header) lines.push(cfg.columns.map((c) => quote(c.label, sep, cfg.quoteAll, true)).join(sep));
  for (const r of rows) {
    lines.push(
      cfg.columns
        .map((c) => {
          const def = defs.get(c.key);
          const v = get(r, c.key);
          if (v === null || v === undefined || !def) return quote("", sep, cfg.quoteAll);
          if (def.kind === "date") return quote(formatExportDate(String(v), cfg.dateFormat), sep, cfg.quoteAll);
          if (typeof v === "number") {
            const cur = (r as { currency?: Currency }).currency ?? "PYG";
            const decimals = def.kind === "money" ? MINOR_DECIMALS[cur] : 0;
            return quote(formatExportNumber(v, cfg, decimals), sep, cfg.quoteAll);
          }
          return quote(String(v), sep, cfg.quoteAll, true);
        })
        .join(sep),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** El desglose de IVA de un documento no cuadra con su importe (solo se avisa: puede haber redondeos o descuentos). */
export const taxMismatch = (d: Pick<ExportDoc, "gross10" | "gross5" | "exempt" | "amountPyg">): boolean =>
  !(d.gross10 === null && d.gross5 === null && d.exempt === null) && Math.abs((d.gross10 ?? 0) + (d.gross5 ?? 0) + (d.exempt ?? 0) - d.amountPyg) > LIMITS.exportFormat.taxToleranceGs;

export const documentTaxInput = z.object({
  docKind: z.enum(TAX_DOC_KINDS),
  docId: z.string().uuid(),
  timbrado: z.string().trim().max(20).nullish(),
  gross10: z.number().int().min(0).max(1_000_000_000_000),
  gross5: z.number().int().min(0).max(1_000_000_000_000),
  exempt: z.number().int().min(0).max(1_000_000_000_000),
});
