/**
 * Armazón común de los correos HTML: lienzo lino, fila de marca, panel principal en surco, tarjeta blanca con los
 * widgets y pie. Solo tablas y estilos en línea (cero imágenes, scripts ni fuentes remotas); el `<style>` del head
 * solo mejora el modo oscuro y el ancho chico, así que sin él el correo se ve igual de bien.
 */
import { safeHtml } from "@yvy/shared";

/** Paleta de la marca y grises de los correos. */
export const P = {
  linen: "#F1EEE4",
  furrow: "#1E2419",
  soy: "#7A9A3F",
  wheat: "#D9A93A",
  /** Trigo como texto sobre blanco (contraste AA). */
  wheatText: "#9A6F10",
  sky: "#8DB3C7",
  /** Cielo apagado de las columnas no destacadas sobre el panel oscuro. */
  skyMuted: "#4E6672",
  alert: "#D2462B",
  ink2: "#5B6056",
  ink3: "#8C8F86",
  line: "#E6E1D3",
  neutralBar: "#CFC8B4",
  track: "#EFEBDF",
  onDark2: "#B9BFAE",
  onDark3: "#7F8775",
  darkLine: "#343B2E",
  white: "#FFFFFF",
} as const;

/** Familias tipográficas (Fraunces casi nunca carga en los clientes de correo: Georgia es el respaldo real). */
export const SERIF = "Fraunces,Georgia,'Times New Roman',serif";
export const SANS = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapa un valor variable para ponerlo en HTML o en un atributo. */
export const esc = (v: unknown): string => safeHtml`${v}`.text;

/** Recorta un texto variable para que ningún dato ajeno infle el correo. */
export const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Saltos de línea de un texto como `<br>`; cada línea se escapa. */
export const lines = (s: string): string => s.split(/\r?\n/).map(esc).join("<br>");

/** Estilo de texto en línea: tamaño, color y extras. */
export const font = (size: number, color: string, extra = ""): string => `font-family:${SANS};font-size:${size}px;color:${color};${extra}`;

const CSS = `@media (max-width:520px){.px{padding-left:20px!important;padding-right:20px!important}.stack{display:block!important;width:100%!important;padding:0 0 14px!important;border:0!important}.hide-sm{display:none!important}}
@media (prefers-color-scheme:dark){.bg,.bg td.canvas{background:#111410!important}.hero{border:1px solid #333B2D!important}.card{background:#1B2019!important;border-color:#2C3229!important}.logo{color:#EEEBE1!important}.spark{background:#4A5244!important}.t1{color:#EEEBE1!important}.t2{color:#ADB1A6!important}.t3{color:#81857C!important}.line{border-color:#2C3229!important}.track{background:#2A3027!important}}`;

/** Entrada del armazón. */
export interface LayoutInput {
  /** Asunto: va como `<title>`. */
  subject: string;
  /** Frase útil que algunos clientes muestran junto al asunto; no se ve en el cuerpo. */
  preheader: string;
  /** Contexto a la derecha de la marca (estancia o período). */
  place: string;
  /** HTML del panel principal oscuro (pastilla, titular y gráfico o cifras protagonistas). */
  hero: string;
  /** HTML de la tarjeta blanca (widgets y botón). */
  body: string;
  /** Primera línea del pie, con un enlace opcional al final (ajustes de avisos). */
  footer: string;
  settings?: { label: string; url: string };
  /** Segunda línea del pie: atribución de los datos. */
  credit?: string;
}

/** Documento HTML completo de un correo. */
export function renderLayout(i: LayoutInput): string {
  const link = i.settings ? ` <a href="${esc(i.settings.url)}" style="color:${P.ink2};">${esc(i.settings.label)}</a>` : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(i.subject)}</title><style>${CSS}</style></head>
<body style="margin:0;background:${P.linen};" class="bg"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(i.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${P.linen};"><tr><td align="center" class="canvas" style="padding:28px 12px 36px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 4px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:${SERIF};font-size:20px;font-weight:700;color:${P.furrow};" class="logo">Yvy</td><td align="right" style="${font(13, P.ink2)}" class="t2">${esc(i.place)}</td></tr></table></td></tr>
<tr><td style="background:${P.furrow};border:1px solid ${P.furrow};border-radius:16px;padding:26px 28px 24px;" class="px hero">${i.hero}</td></tr>
<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="card px" style="background:${P.white};border:1px solid ${P.line};border-radius:16px;padding:26px 28px 28px;">${i.body}</td></tr>
<tr><td style="padding:20px 4px 0;${font(12, P.ink3, "line-height:18px;")}" class="t3">${esc(i.footer)}${link}${i.credit ? `<br>${esc(i.credit)}` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}
