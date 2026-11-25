/**
 * Widgets de los correos: funciones puras que devuelven `Markup` de tablas con estilos en línea y clases de modo
 * oscuro. Los textos se escapan solos (`safeHtml`). El color solo aparece cuando significa algo y siempre con el
 * dato escrito al lado.
 */
import { safeHtml, type Markup } from "@yvy/shared";
import { P, SERIF, font } from "../layout";

/** Un número en es-PY: coma decimal y sin decimales sobrantes. */
export const fmtNum = (n: number, digits = 0): string => n.toFixed(digits).replace(".", ",");

const table = (inner: Markup, extra = ""): Markup =>
  safeHtml`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${extra}">${inner}</table>`;

/** Espacio vertical. */
export const gap = (h: number): Markup => safeHtml`<div style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</div>`;

/** Significado de un color: peligro, atención, bien o neutro. */
export type Tone = "bad" | "warn" | "good" | "info" | "neutral";

const CHIP: Record<Tone, [string, string]> = {
  bad: [P.alert, P.white],
  warn: [P.wheat, P.furrow],
  good: [P.soy, P.furrow],
  info: [P.sky, P.furrow],
  neutral: [P.darkLine, P.linen],
};

/** Pastilla de texto corto (tipo o severidad del correo, variación de una cifra). */
export const chip = (text: string, tone: Tone): Markup =>
  safeHtml`<span style="display:inline-block;background:${CHIP[tone][0]};color:${CHIP[tone][1]};${font(12, CHIP[tone][1], "font-weight:600;")}padding:4px 10px;border-radius:999px;">${text}</span>`;

/** Encabezado del panel oscuro: pastilla, titular con el dato y una frase. */
export const heroTitle = (chipHtml: Markup, title: string, sub?: string): Markup => {
  const subHtml = sub ? safeHtml`<div style="padding-top:6px;${font(15, P.onDark2, "line-height:22px;")}">${sub}</div>` : "";
  return safeHtml`${chipHtml}${gap(14)}<div style="${font(23, P.linen, "font-weight:600;line-height:29px;letter-spacing:-0.3px;")}">${title}</div>${subHtml}`;
};

/** Título de un bloque de la tarjeta. */
export const h2 = (text: string, margin = "0 0 12px"): Markup => safeHtml`<div style="margin:${margin};${font(14, P.furrow, "font-weight:600;")}" class="t1">${text}</div>`;

/** Columna del gráfico sobre fondo oscuro. */
export interface DarkBar {
  label: string;
  /** Valor que fija la altura. */
  value: number;
  /** Texto sobre la columna si no es el valor tal cual. */
  display?: string;
  /** Columna destacada (supera el umbral o es la mínima). */
  strong?: boolean;
}

/** Columnas sobre fondo oscuro: las destacadas en cielo, el resto apagadas; con leyenda que explica el destacado. */
export function darkBars(bars: DarkBar[], legend?: string, h = 96): Markup {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const cols = bars.map((b) => {
    const px = Math.max(3, Math.round((b.value / max) * h));
    const bold = b.strong ? "font-weight:700;" : "";
    const bar = table(safeHtml`<tr><td height="${px}" style="height:${px}px;background:${b.strong ? P.sky : P.skyMuted};border-radius:4px 4px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>`, "width:22px;");
    return safeHtml`<td align="center" valign="bottom" style="height:${h + 20}px;padding:0 3px;"><div style="${font(11, b.strong ? P.linen : P.onDark3, `font-variant-numeric:tabular-nums;padding-bottom:4px;${bold}`)}">${b.display ?? b.value}</div>${bar}</td>`;
  });
  const labels = bars.map((b) => safeHtml`<td align="center" style="padding-top:7px;${font(11, b.strong ? P.linen : P.onDark3)}">${b.label}</td>`);
  const note = legend
    ? safeHtml`<div style="padding-top:10px;${font(12, P.onDark2)}"><span style="display:inline-block;width:14px;height:3px;background:${P.sky};vertical-align:middle;margin-right:6px;border-radius:2px;"></span><span style="vertical-align:middle;">${legend}</span></div>`
    : "";
  return safeHtml`${table(safeHtml`<tr>${cols}</tr><tr><td colspan="${bars.length}" style="border-top:1px solid ${P.darkLine};font-size:0;line-height:0;">&nbsp;</td></tr><tr>${labels}</tr>`)}${note}`;
}

/** Cifra del panel oscuro, con una variación opcional en pastilla. */
export interface Stat {
  label: string;
  value: string;
  delta?: { text: string; tone: "bad" | "good" };
}

/** Cifras sobre fondo oscuro separadas por líneas finas; en pantallas angostas se apilan. */
export function darkStats(items: Stat[]): Markup {
  const cells = items.map((s, i) => {
    const border = i ? `border-left:1px solid ${P.darkLine};padding-left:16px;` : "";
    const delta = s.delta ? safeHtml`<div style="padding-top:4px;">${chip(s.delta.text, s.delta.tone)}</div>` : "";
    return safeHtml`<td class="stack" valign="top" style="${border}padding-right:12px;"><div style="${font(12, P.onDark2)}">${s.label}</div><div style="padding-top:4px;${font(26, P.linen, "font-weight:600;letter-spacing:-0.4px;font-variant-numeric:tabular-nums;")}">${s.value}</div>${delta}</td>`;
  });
  return table(safeHtml`<tr>${cells}</tr>`);
}

/** Fila de una comparación. */
export interface CompareRow {
  label: string;
  value: number;
  color: string;
  /** Cifra escrita a la derecha de la barra. */
  text: string;
}

/** Barras horizontales proporcionales al mayor valor, con la cifra a la derecha (rankings, este período contra lo normal). */
export function compare(rows: CompareRow[]): Markup {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const body = rows.map((r) => {
    const fill = table(safeHtml`<tr><td height="10" style="height:10px;background:${r.color};border-radius:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`, `width:${Math.max(2, Math.round((r.value / max) * 100))}%;`);
    const track = table(safeHtml`<tr><td class="track" style="background:${P.track};border-radius:6px;">${fill}</td></tr>`);
    return safeHtml`<tr><td style="padding:5px 12px 5px 0;width:150px;white-space:nowrap;${font(13, P.ink2)}" class="t2">${r.label}</td><td style="padding:5px 0;">${track}</td><td align="right" style="padding:5px 0 5px 12px;width:72px;${font(13, P.furrow, "font-weight:600;font-variant-numeric:tabular-nums;")}" class="t1">${r.text}</td></tr>`;
  });
  return table(safeHtml`${body}`);
}

/** Tendencia: columnas finas grises con la última en el color que corresponda. */
export function trend(values: number[], color: string): Markup {
  const max = Math.max(...values, 1);
  const h = 26;
  const cols = values.map((v, i) => {
    const px = Math.max(2, Math.round((v / max) * h));
    const last = i === values.length - 1;
    return safeHtml`<td valign="bottom" style="height:${h}px;padding-right:2px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="5" height="${px}" style="width:5px;height:${px}px;background:${last ? color : P.neutralBar};border-radius:2px;font-size:0;line-height:0;" class="${last ? "" : "spark"}">&nbsp;</td></tr></table></td>`;
  });
  return safeHtml`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table>`;
}

/** Fila de lote o de lista: nombre y detalle a la izquierda; tendencia y cifra (opcionalmente coloreada) a la derecha. */
export interface PlotRow {
  name: string;
  detail?: string;
  spark?: number[];
  value: string;
  /** Color de la cifra cuando significa algo (empeoró, vencido); sin él va en tinta. */
  valueColor?: string;
  sub?: string;
}

/** Filas separadas por líneas finas. */
export function plotRows(rows: PlotRow[]): Markup {
  const body = rows.map((r) => {
    const detail = r.detail ? safeHtml`<div style="padding-top:2px;${font(12, P.ink3)}" class="t3">${r.detail}</div>` : "";
    const sub = r.sub ? safeHtml`<div style="${font(12, P.ink3)}" class="t3">${r.sub}</div>` : "";
    const spark = r.spark ? trend(r.spark, r.valueColor ?? P.ink2) : "";
    return safeHtml`<tr>
<td class="line" style="padding:12px 0;border-top:1px solid ${P.line};"><div style="${font(14, P.furrow, "font-weight:500;")}" class="t1">${r.name}</div>${detail}</td>
<td class="line hide-sm" align="right" valign="middle" style="padding:12px 12px;border-top:1px solid ${P.line};">${spark}</td>
<td class="line" align="right" valign="middle" style="padding:12px 0;border-top:1px solid ${P.line};white-space:nowrap;"><div style="${font(14, r.valueColor ?? P.furrow, "font-weight:600;font-variant-numeric:tabular-nums;")}" class="${r.valueColor ? "" : "t1"}">${r.value}</div>${sub}</td></tr>`;
  });
  return table(safeHtml`${body}`);
}

/** Lista de indicaciones con viñeta soja. */
export const bullets = (items: string[]): Markup =>
  safeHtml`${items.map((t) => safeHtml`<div style="padding:4px 0;${font(14, P.furrow, "line-height:21px;")}" class="t1"><span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:${P.soy};vertical-align:middle;margin-right:10px;"></span><span style="vertical-align:middle;">${t}</span></div>`)}`;

/** Tabla de pares clave y valor. */
export const keyValue = (rows: [string, string][]): Markup =>
  table(
    safeHtml`${rows.map(([k, v], i) => {
      const top = i ? `border-top:1px solid ${P.line};` : "";
      return safeHtml`<tr><td class="line t2" valign="top" width="38%" style="padding:10px 12px 10px 0;${top}${font(13, P.ink2)}">${k}</td><td class="line t1" valign="top" style="padding:10px 0;${top}${font(14, P.furrow)}">${v}</td></tr>`;
    })}`,
  );

/** Párrafo de texto corriente de la tarjeta. */
export const note = (text: string): Markup => safeHtml`<div style="padding-top:20px;${font(14, P.ink2)}" class="t2">${text}</div>`;

/** Medidor de una sola barra con marcador y el tramo escrito debajo (THI, probabilidad). */
export function gauge(i: { value: number; min: number; max: number; color: string; caption: string; ticks?: string }): Markup {
  const pct = Math.max(2, Math.min(98, Math.round(((i.value - i.min) / (i.max - i.min)) * 100)));
  const bar = table(
    safeHtml`<tr><td width="${pct}%" height="10" style="height:10px;background:${i.color};border-radius:5px 0 0 5px;font-size:0;line-height:0;">&nbsp;</td><td width="2" style="background:${P.furrow};font-size:0;line-height:0;" class="t1">&nbsp;</td><td class="track" style="background:${P.track};border-radius:0 5px 5px 0;font-size:0;line-height:0;">&nbsp;</td></tr>`,
  );
  const ticks = i.ticks ? safeHtml`<div style="${font(12, P.ink3)}" class="t3">${i.ticks}</div>` : "";
  return safeHtml`${bar}<div style="padding-top:8px;${font(13, P.furrow, "font-weight:600;")}" class="t1">${i.caption}</div>${ticks}`;
}

/** Barra de avance en un solo color con el avance escrito. */
export function progressBar(i: { value: number; max: number; color: string; caption: string }): Markup {
  const pct = Math.max(2, Math.min(100, Math.round((i.value / Math.max(i.max, 1)) * 100)));
  const fill = table(safeHtml`<tr><td height="10" style="height:10px;background:${i.color};border-radius:5px;font-size:0;line-height:0;">&nbsp;</td></tr>`, `width:${pct}%;`);
  return safeHtml`${table(safeHtml`<tr><td class="track" style="background:${P.track};border-radius:5px;">${fill}</td></tr>`)}<div style="padding-top:8px;${font(13, P.ink2)}" class="t2">${i.caption}</div>`;
}

/** Código grande en lino con espaciado, dentro del panel oscuro. */
export const bigCode = (code: string): Markup =>
  safeHtml`<div style="font-family:${SERIF};font-size:44px;line-height:50px;font-weight:700;letter-spacing:10px;color:${P.linen};">${code}</div>`;

/** Cita de un comentario dentro del panel oscuro (`text` ya viene escrito como marcado, con sus saltos de línea). */
export const heroQuote = (author: string, text: Markup): Markup =>
  safeHtml`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${P.soy};padding:4px 0 4px 16px;"><div style="${font(13, P.onDark2, "font-weight:600;")}">${author}</div><div style="padding-top:4px;${font(16, P.linen, "line-height:24px;")}">${text}</div></td></tr></table>`;

/** Botón con texto surco sobre soja y rectángulo VML para Outlook. */
export function button(href: string, label: string): Markup {
  const width = Math.max(160, Math.min(300, label.length * 9 + 48));
  const vml = safeHtml`<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:44px;v-text-anchor:middle;width:${width}px;" arcsize="20%" stroke="f" fillcolor="${P.soy}"><center style="color:${P.furrow};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->`;
  const link = safeHtml`<!--[if !mso]><!--><a href="${href}" style="display:inline-block;padding:12px 20px;${font(15, P.furrow, "font-weight:600;text-decoration:none;")}">${label}</a><!--<![endif]-->`;
  return safeHtml`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td style="background:${P.soy};border-radius:10px;">${vml}${link}</td></tr></table>`;
}
