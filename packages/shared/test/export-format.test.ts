import { describe, expect, it } from "vitest";
import { defaultExportConfig, EXPORT_COLUMNS, exportConfigSchema, formatExportDate, formatExportNumber, libroIvaConfig, renderExport, taxMismatch, vatIncluded, type ExportCashMove, type ExportDoc } from "../src";

const doc = (over: Partial<ExportDoc> = {}): ExportDoc => ({
  docKind: "purchase",
  docId: "d1",
  date: "2026-11-05",
  number: "001-001-0001234",
  concept: "Compra",
  party: 'Agro "Ñandú"; S.A.',
  ruc: "80012345-6",
  currency: "PYG",
  amountMinor: 1_650_000,
  amountPyg: 1_650_000,
  dueDate: null,
  timbrado: "12345678",
  gross10: 1_100_000,
  gross5: 420_000,
  exempt: 130_000,
  ...over,
});

describe("I-06 exportación para sistemas contables", () => {
  it("fechas y números con el formato pedido", () => {
    expect(formatExportDate("2026-11-05", "dmy_slash")).toBe("05/11/2026");
    expect(formatExportDate("2026-11-05", "dmy_dash")).toBe("05-11-2026");
    expect(formatExportDate("2026-11-05", "ymd_compact")).toBe("20261105");
    expect(formatExportDate(null, "iso")).toBe("");
    const es = { decimal: ",", thousands: "." } as const;
    expect(formatExportNumber(1234567.891, es, 2)).toBe("1.234.567,89");
    expect(formatExportNumber(1234567, { decimal: ".", thousands: "" }, 0)).toBe("1234567");
    expect(formatExportNumber(-1500.5, { decimal: ".", thousands: "," }, 2)).toBe("-1,500.50");
    expect(formatExportNumber(0.004, { decimal: ".", thousands: "" }, 2)).toBe("0.00");
  });

  it("IVA incluido: 10 % es un onceavo y 5 % un veintiunavo", () => {
    expect(vatIncluded(1_100_000, 10)).toBe(100_000);
    expect(vatIncluded(420_000, 5)).toBe(20_000);
  });

  it("libro IVA de compras: columnas del formato típico de Paraguay con ; y fecha dd/mm/aaaa", () => {
    const cfg = libroIvaConfig("purchases");
    expect(cfg.columns.map((c) => c.label)).toEqual(["Fecha", "RUC", "Proveedor", "Timbrado", "N° de factura", "Gravadas 10 %", "Gravadas 5 %", "Exentas", "IVA 10 %", "IVA 5 %", "Total"]);
    const out = renderExport("purchases", [doc()], cfg).split("\r\n");
    expect(out[0]).toBe("Fecha;RUC;Proveedor;Timbrado;N° de factura;Gravadas 10 %;Gravadas 5 %;Exentas;IVA 10 %;IVA 5 %;Total");
    // el texto con ; y comillas va entre comillas
    expect(out[1]).toBe('05/11/2026;80012345-6;"Agro ""Ñandú""; S.A.";12345678;001-001-0001234;1100000;420000;130000;100000;20000;1650000');
    expect(libroIvaConfig("sales").columns[2]!.label).toBe("Cliente");
  });

  it("sin desglose de IVA las gravadas quedan vacías y el total es el importe", () => {
    const out = renderExport("purchases", [doc({ gross10: null, gross5: null, exempt: null, timbrado: null })], libroIvaConfig("purchases")).split("\r\n")[1]!;
    expect(out.endsWith(";;;;;;1650000")).toBe(true);
  });

  it("formato propio: columnas elegidas, rótulos, separador, decimales y moneda de la fila", () => {
    const cfg = {
      ...defaultExportConfig("purchases"),
      separator: "tab" as const,
      dateFormat: "iso" as const,
      decimal: "," as const,
      thousands: "." as const,
      columns: [{ key: "date", label: "F" }, { key: "currency", label: "M" }, { key: "amount", label: "Importe" }, { key: "nope", label: "X" }],
    };
    const usd = doc({ currency: "USD", amountMinor: 123_456, amountPyg: 900_000 });
    const out = renderExport("purchases", [usd, doc()], cfg).split("\r\n");
    expect(out.slice(0, 3)).toEqual(["F\tM\tImporte\tX", "2026-11-05\tUSD\t1.234,56\t", "2026-11-05\tPYG\t1.650.000\t"]);
    expect(renderExport("purchases", [doc()], { ...cfg, header: false }).startsWith("2026-11-05\t")).toBe(true);
  });

  it("caja: entrada y salida en columnas separadas", () => {
    const m = (amountMinor: number): ExportCashMove => ({ date: "2026-11-06", account: "Caja", currency: "PYG", description: "=cmd", party: "", ruc: "", docKind: "", amountMinor });
    const cfg = { ...defaultExportConfig("cash"), columns: [{ key: "description", label: "D" }, { key: "income", label: "E" }, { key: "outflow", label: "S" }, { key: "amount", label: "I" }] };
    expect(renderExport("cash", [m(500_000), m(-200_000)], cfg).split("\r\n").slice(1, 3)).toEqual(["'=cmd;500000;;500000", "'=cmd;;200000;-200000"]);
  });

  it("el formato por defecto cubre todas las columnas y el esquema lo valida", () => {
    for (const ds of ["purchases", "sales", "cash"] as const) {
      const cfg = defaultExportConfig(ds);
      expect(cfg.columns).toHaveLength(EXPORT_COLUMNS[ds].length);
      expect(exportConfigSchema.safeParse(cfg).success).toBe(true);
    }
    expect(exportConfigSchema.safeParse({ ...defaultExportConfig("cash"), columns: [] }).success).toBe(false);
  });

  it("avisa cuando el desglose no cuadra con el importe", () => {
    expect(taxMismatch(doc())).toBe(false);
    expect(taxMismatch(doc({ gross10: 1_000_000 }))).toBe(true);
    expect(taxMismatch(doc({ gross10: null, gross5: null, exempt: null }))).toBe(false);
  });
});
