/** Gráficos de los correos hechos solo con celdas de tabla: columnas, barras, escalas, tiras de calor, pronóstico, progreso y tendencia. */
import { raw, type Markup } from "@yvy/shared";
import { C, SANS, esc } from "../layout";

const F = `font-family:${SANS};`;

/** Muestra de color con su texto, para la leyenda de un gráfico. */
export interface LegendItem {
  color: string;
  text: string;
}

/** Leyenda de colores bajo un gráfico. */
export function legend(items: LegendItem[]): Markup {
  const cells = items
    .map(
      (l, i) =>
        `<td width="10" height="10" style="background:${l.color};border-radius:2px;font-size:0;">&nbsp;</td><td style="padding:0 ${i === items.length - 1 ? 0 : 14}px 0 6px;${F}font-size:12px;color:${C.muted};" class="t2">${esc(l.text)}</td>`,
    )
    .join("");
  return raw(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>${cells}</tr></table>`);
}

/** Columna de un gráfico de barras. `strong` la destaca (supera el umbral). */
export interface Bar {
  label: string;
  value: number;
  strong?: boolean;
  /** Color propio de la columna (por ejemplo por nivel de riesgo); reemplaza al de `colors`. */
  color?: string;
  /** Texto sobre la columna si no es el valor tal cual. */
  display?: string;
}

/** Entrada del gráfico de columnas. */
export interface BarChartInput {
  bars: Bar[];
  /** Colores de las columnas normales, destacadas y en cero. */
  colors?: { light: string; strong: string; zero: string };
  /** Alto máximo de una columna en px (por defecto 120). */
  height?: number;
  legend?: LegendItem[];
}

const SKY = { light: C.sky, strong: C.skyDark, zero: C.skyLight };

/** Columnas de alto proporcional con el valor arriba, la etiqueta abajo y línea de base; las destacadas van en color fuerte. */
export function barChart(i: BarChartInput): Markup {
  const colors = i.colors ?? SKY;
  const h = i.height ?? 120;
  const max = Math.max(...i.bars.map((b) => b.value), 1);
  const w = Math.floor(100 / i.bars.length);
  const cols = i.bars
    .map((b) => {
      const px = b.value > 0 ? Math.max(4, Math.round((b.value / max) * h)) : 2;
      const color = b.value <= 0 ? colors.zero : (b.color ?? (b.strong ? colors.strong : colors.light));
      const radius = b.value > 0 ? "border-radius:4px 4px 0 0;" : "";
      return `<td align="center" valign="bottom" width="${w}%" style="height:${h + 30}px;"><div style="${F}font-size:12px;${b.strong ? "font-weight:700;" : ""}color:${b.strong ? C.furrow : C.text2};padding-bottom:4px;" class="${b.strong ? "t1" : "t2"}">${esc(b.display ?? fmt(b.value))}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="60%"><tr><td height="${px}" style="height:${px}px;background:${color};${radius}font-size:0;line-height:0;">&nbsp;</td></tr></table></td>`;
    })
    .join("");
  const labels = i.bars
    .map((b) => `<td align="center" style="padding-top:6px;${F}font-size:12px;${b.strong ? "font-weight:700;" : ""}color:${b.strong ? C.furrow : C.muted};" class="${b.strong ? "t1" : "t2"}">${esc(b.label)}</td>`)
    .join("");
  return raw(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr><tr><td colspan="${i.bars.length}" style="border-top:1px solid ${C.axis};font-size:0;line-height:0;" class="rule">&nbsp;</td></tr><tr>${labels}</tr></table>${i.legend ? legend(i.legend).text : ""}`,
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** Fila de barras horizontales comparadas. */
export interface CompareRow {
  label: string;
  value: number;
  display: string;
  /** Color de la barra; la fila principal va en color fuerte y las de referencia en suave. */
  color: string;
  strong?: boolean;
}

/** Barras horizontales proporcionales al mayor valor (este período contra lo normal, registros por tipo). */
export function compareBars(rows: CompareRow[]): Markup {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const body = rows
    .map((r) => {
      const pct = Math.max(3, Math.round((r.value / max) * 72));
      return `<tr><td style="${F}font-size:13px;color:${C.text2};padding:4px 0;width:110px;" class="t2">${esc(r.label)}</td><td style="padding:4px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="${pct}%" height="12" style="height:12px;background:${r.color};border-radius:6px 0 0 6px;font-size:0;">&nbsp;</td><td width="${100 - pct}%" style="${F}font-size:13px;${r.strong ? "font-weight:700;" : ""}color:${r.strong ? C.furrow : C.text2};padding-left:8px;" class="${r.strong ? "t1" : "t2"}">${esc(r.display)}</td></tr></table></td></tr>`;
    })
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>`);
}

/** Tramo de una escala. */
export interface Segment {
  label: string;
  /** Rango en texto bajo la etiqueta (por ejemplo "75 a 78"). */
  range?: string;
  color: string;
}

/** Escala segmentada con el tramo actual marcado con ▼ y en negrita; los demás van apagados al 55 %. */
export function scale(segments: Segment[], active: number, valueText?: string): Markup {
  const w = Math.floor(100 / segments.length);
  const marker = segments
    .map((_, i) => `<td width="${w}%" align="center" style="${F}font-size:13px;line-height:16px;color:${C.furrow};padding:0 2px 3px;" class="t1">${i === active ? `▼${valueText ? ` ${esc(valueText)}` : ""}` : "&nbsp;"}</td>`)
    .join("");
  const bars = segments
    .map((s, i) => `<td width="${w}%" height="12" style="height:12px;background:${s.color};${i === active ? "" : "opacity:0.55;"}border-radius:${i === 0 ? "6px 0 0 6px" : i === segments.length - 1 ? "0 6px 6px 0" : "0"};font-size:0;line-height:0;border-right:2px solid ${C.card};">&nbsp;</td>`)
    .join("");
  const labels = segments
    .map(
      (s, i) =>
        `<td width="${w}%" align="center" valign="top" style="padding:6px 2px 0;${F}font-size:12px;line-height:16px;${i === active ? "font-weight:700;" : ""}color:${i === active ? C.furrow : C.muted};" class="${i === active ? "t1" : "t2"}">${esc(s.label)}${s.range ? `<br><span style="font-weight:400;">${esc(s.range)}</span>` : ""}</td>`,
    )
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${marker}</tr><tr>${bars}</tr><tr>${labels}</tr></table>`);
}

/** Celda de una tira de calor. */
export interface HeatCell {
  label: string;
  /** Texto dentro de la celda. */
  value: string;
  color: string;
  /** Texto claro (celdas oscuras). */
  light?: boolean;
}

/** Tira de celdas coloreadas por intensidad con su valor adentro y la etiqueta debajo. */
export function heatStrip(cells: HeatCell[]): Markup {
  const w = Math.floor(100 / cells.length);
  const row = cells
    .map(
      (c) =>
        `<td width="${w}%" align="center" style="padding:0 1px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" height="34" style="height:34px;background:${c.color};border-radius:4px;${F}font-size:12px;font-weight:600;color:${c.light ? C.linen : C.furrow};">${esc(c.value)}</td></tr></table></td>`,
    )
    .join("");
  const labels = cells
    .map((c) => `<td align="center" style="padding-top:4px;${F}font-size:11px;color:${C.muted};" class="t2">${esc(c.label)}</td>`)
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${row}</tr><tr>${labels}</tr></table>`);
}

/** Día del pronóstico. */
export interface ForecastDay {
  label: string;
  max: number | null;
  min: number | null;
  rainMm: number | null;
}

/** Pronóstico de 5 a 7 días: día, máxima, mínima y mini barra de lluvia. */
export function forecastStrip(days: ForecastDay[]): Markup {
  const w = Math.floor(100 / days.length);
  const maxRain = Math.max(...days.map((d) => d.rainMm ?? 0), 1);
  const cells = days
    .map((d) => {
      const rain = d.rainMm ?? 0;
      const px = rain > 0 ? Math.max(3, Math.round((rain / maxRain) * 28)) : 2;
      return `<td width="${w}%" align="center" valign="top" style="padding:10px 2px;background:${C.soft};border-right:2px solid ${C.card};" class="soft"><div style="${F}font-size:12px;color:${C.muted};" class="t2">${esc(d.label)}</div><div style="${F}font-size:16px;font-weight:700;color:${C.furrow};padding-top:4px;" class="t1">${d.max === null ? "-" : `${Math.round(d.max)}°`}</div><div style="${F}font-size:12px;color:${C.muted};" class="t2">${d.min === null ? "-" : `${Math.round(d.min)}°`}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="40%" style="margin-top:8px;"><tr><td height="${px}" style="height:${px}px;background:${rain > 0 ? C.sky : C.skyLight};border-radius:3px 3px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr></table><div style="${F}font-size:11px;color:${C.muted};padding-top:2px;" class="t2">${rain > 0 ? `${fmt(rain)} mm` : "&nbsp;"}</div></td>`;
    })
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`);
}

/** Barra de progreso con etiqueta a la izquierda y cifra a la derecha (la barra se llena hasta `value / max`). */
export function progress(i: { label: string; display: string; value: number; max: number; color?: string }): Markup {
  const pct = Math.max(2, Math.min(100, Math.round((i.value / Math.max(i.max, 1)) * 100)));
  const rest = pct < 100 ? `<td style="background:${C.rule};border-radius:0 6px 6px 0;font-size:0;" class="rule">&nbsp;</td>` : "";
  return raw(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr><td style="${F}font-size:13px;color:${C.text2};padding-bottom:4px;" class="t2">${esc(i.label)}</td><td align="right" style="${F}font-size:13px;font-weight:700;color:${C.furrow};padding-bottom:4px;" class="t1">${esc(i.display)}</td></tr><tr><td colspan="2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="${pct}%" height="12" style="height:12px;background:${i.color ?? C.soy};border-radius:6px ${pct === 100 ? "6px 6px" : "0 0"} 6px;font-size:0;line-height:0;">&nbsp;</td>${rest}</tr></table></td></tr></table>`,
  );
}

/** Tendencia en 12 a 30 columnas finas; la última va destacada. */
export function sparkline(values: number[], color: string = C.skyDark): Markup {
  const max = Math.max(...values, 1);
  const w = (100 / values.length).toFixed(2);
  const cells = values
    .map((v, i) => {
      const px = Math.max(2, Math.round((v / max) * 44));
      const last = i === values.length - 1;
      return `<td width="${w}%" valign="bottom" align="center" style="height:48px;padding:0 1px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${px}" style="height:${px}px;background:${last ? color : C.skyLight};border-radius:2px 2px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr></table></td>`;
    })
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`);
}
