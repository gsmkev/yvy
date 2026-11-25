/** Widgets de bloque de los correos: cifras, listas, llamadas a la acción, citas y tablas de datos. Todo con tablas y estilos en línea. */
import { raw, type Markup } from "@yvy/shared";
import { C, SANS, SERIF, esc, lines } from "../layout";

const F = `font-family:${SANS};`;

/** Un número en es-PY: coma decimal y sin decimales sobrantes. */
export const fmtNum = (n: number, digits = 0): string => n.toFixed(digits).replace(".", ",");

/** Título de un bloque (14 px, seminegrita) con 28 px de aire encima. */
export const sectionTitle = (text: string, note?: string): Markup =>
  raw(
    `<p style="margin:28px 0 ${note ? 2 : 12}px;${F}font-size:14px;font-weight:600;color:${C.furrow};" class="t1">${esc(text)}</p>${
      note ? `<p style="margin:0 0 12px;${F}font-size:12px;color:${C.muted};" class="t2">${esc(note)}</p>` : ""
    }`,
  );

/** Variación contra otro período: el color depende de si el cambio es bueno o malo, no del signo. */
export interface Delta {
  text: string;
  tone: "good" | "bad" | "flat";
}

/** Cifra de la fila de cifras. */
export interface Kpi {
  label: string;
  value: string;
  unit?: string;
  delta?: Delta;
}

const DELTA_STYLE = { good: `color:${C.soyDark};`, bad: `color:${C.alert};`, flat: `color:${C.muted};` } as const;
const DELTA_ARROW = { good: "▲", bad: "▼", flat: "" } as const;

/** Fila de 2 a 4 cifras en recuadros suaves; en pantallas angostas se apilan. */
export function kpiRow(items: Kpi[]): Markup {
  const w = Math.floor(100 / items.length);
  const cells = items
    .map((k, i) => {
      const delta = k.delta
        ? `<div style="${F}font-size:12px;line-height:16px;padding-top:2px;${DELTA_STYLE[k.delta.tone]}" class="${k.delta.tone === "flat" ? "t2" : k.delta.tone === "good" ? "good" : "bad"}">${DELTA_ARROW[k.delta.tone]} ${esc(k.delta.text)}</div>`
        : "";
      return `${i ? `<td width="8" class="hide-sm" style="font-size:0;">&nbsp;</td>` : ""}<td class="kpi soft" width="${w}%" style="background:${C.soft};border-radius:8px;padding:14px 16px;vertical-align:top;"><div style="${F}font-size:12px;color:${C.muted};" class="t2">${esc(k.label)}</div><div style="font-family:${SERIF};font-size:28px;line-height:34px;font-weight:700;color:${C.furrow};" class="t1">${esc(k.value)}${k.unit ? `<span style="font-size:15px;font-weight:400;"> ${esc(k.unit)}</span>` : ""}</div>${delta}</td>`;
    })
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`);
}

/** Fila de la lista de lotes: punto de color, nombre, detalle opcional, chip opcional y cifra a la derecha. */
export interface PlotRow {
  color: string;
  name: string;
  detail?: string;
  value: string;
  chip?: { text: string; color: string };
}

/** Lista de filas con separadores (lotes afectados, aguadas, lotes que empeoraron). */
export function plotList(rows: PlotRow[]): Markup {
  const last = rows.length - 1;
  const body = rows
    .map((r, i) => {
      const b = `padding:10px 0;border-top:1px solid ${C.rule};${i === last ? `border-bottom:1px solid ${C.rule};` : ""}`;
      const chip = r.chip
        ? ` <span style="display:inline-block;padding:1px 8px;border-radius:8px;background:${r.chip.color};color:${C.furrow};font-size:12px;font-weight:600;">${esc(r.chip.text)}</span>`
        : "";
      return `<tr><td style="${b}color:${C.furrow};" class="rule t1"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${r.color};margin-right:8px;"></span>${esc(r.name)}${chip}</td><td style="${b}color:${C.muted};" class="rule t2 hide-sm">${esc(r.detail ?? "")}</td><td align="right" style="${b}color:${C.furrow};font-weight:600;white-space:nowrap;" class="rule t1">${esc(r.value)}</td></tr>`;
    })
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${F}font-size:14px;">${body}</table>`);
}

/** Bloque "Qué hacer": título y una línea por indicación, con borde soja. */
export function callout(title: string, items: string[]): Markup {
  const body = items
    .map((l, i) => `<p style="margin:0 0 ${i === items.length - 1 ? 0 : 4}px;${F}font-size:14px;line-height:21px;color:${C.text2};" class="t2">${esc(l)}</p>`)
    .join("");
  return raw(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="background:${C.soft};border-left:4px solid ${C.soy};border-radius:0 8px 8px 0;padding:16px 18px;" class="soft"><p style="margin:0 0 8px;${F}font-size:14px;font-weight:600;color:${C.furrow};" class="t1">${esc(title)}</p>${body}</td></tr></table>`,
  );
}

/** Cita de un comentario: quién y el texto, con borde soja. */
export function quote(author: string, text: string): Markup {
  return raw(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.soft};border-left:4px solid ${C.soy};border-radius:0 8px 8px 0;padding:16px 18px;" class="soft"><p style="margin:0 0 6px;${F}font-size:14px;font-weight:600;color:${C.furrow};" class="t1">${esc(author)}</p><p style="margin:0;${F}font-size:16px;line-height:24px;color:${C.text2};" class="t2">${lines(text).text}</p></td></tr></table>`,
  );
}

/** Tabla de pares clave y valor (correos internos y datos de contexto). */
export function keyValue(rows: [string, string][]): Markup {
  const body = rows
    .map(([k, v], i) => {
      const b = `padding:10px 0;${i ? `border-top:1px solid ${C.rule};` : ""}`;
      return `<tr><td width="38%" valign="top" style="${b}${F}font-size:14px;line-height:20px;color:${C.muted};" class="rule t2">${esc(k)}</td><td valign="top" style="${b}${F}font-size:14px;line-height:20px;color:${C.furrow};" class="rule t1">${esc(v)}</td></tr>`;
    })
    .join("");
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>`);
}

/** Párrafo de texto corriente. */
export const paragraph = (text: string, muted = false): Markup =>
  raw(
    `<p style="margin:16px 0 0;${F}font-size:${muted ? 14 : 16}px;line-height:${muted ? 20 : 24}px;color:${muted ? C.muted : C.text2};" class="t2">${esc(text)}</p>`,
  );

/** Chip de texto corto de un color (estado de un lote, nivel de un aviso). */
export const badge = (text: string, color: string): Markup =>
  raw(`<span style="display:inline-block;padding:1px 8px;border-radius:8px;background:${color};color:${C.furrow};${F}font-size:12px;font-weight:600;">${esc(text)}</span>`);
