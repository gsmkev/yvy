/**
 * Armazón común de los correos HTML: banda de marca, franja de severidad o tipo, tarjeta, pie y botón.
 * Solo tablas y estilos en línea (cero imágenes, scripts ni fuentes remotas); el `<style>` del head solo mejora
 * el modo oscuro y el ancho chico, así que sin él el correo se ve igual de bien.
 */
import { raw, safeHtml, type Markup } from "@yvy/shared";

/** Colores de la marca y derivados para los gráficos. */
export const C = {
  linen: "#F1EEE4",
  furrow: "#1E2419",
  soy: "#7A9A3F",
  /** Verde del botón: con texto lino llega a contraste AA. */
  soyDark: "#4F6B2A",
  wheat: "#D9A93A",
  sky: "#8DB3C7",
  skyDark: "#3F7391",
  skyLight: "#C9D9E2",
  alert: "#D2462B",
  alertDark: "#8E2A18",
  soft: "#F6F4EC",
  line: "#E3DED0",
  rule: "#ECE8DC",
  axis: "#CFC9B8",
  text2: "#3A4034",
  muted: "#5C6156",
  card: "#FFFFFF",
} as const;

/** Familias tipográficas (Fraunces casi nunca carga en los clientes de correo: Georgia es el respaldo real). */
export const SERIF = "Fraunces,Georgia,'Times New Roman',serif";
export const SANS = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapa un valor variable para ponerlo en HTML o en un atributo. */
export const esc = (v: unknown): string => safeHtml`${v}`.text;

/** Recorta un texto variable para que ningún dato ajeno infle el correo. */
export const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Saltos de línea de un texto como `<br>`; cada línea se escapa. */
export const lines = (s: string): Markup => raw(s.split(/\r?\n/).map(esc).join("<br>"));

/** Botón "a prueba de balas": enlace con relleno para los clientes normales y rectángulo VML para Outlook. */
export function button(label: string, url: string): Markup {
  const width = Math.max(180, Math.min(300, label.length * 10 + 56));
  return raw(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="border-radius:8px;background:${C.soyDark};">` +
      `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(url)}" style="height:44px;v-text-anchor:middle;width:${width}px;" arcsize="18%" stroke="f" fillcolor="${C.soyDark}"><center style="color:${C.linen};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->` +
      `<!--[if !mso]><!--><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:15px;font-weight:600;color:${C.linen};text-decoration:none;border-radius:8px;">${esc(label)}</a><!--<![endif]-->` +
      `</td></tr></table>`,
  );
}

/** Entrada del armazón. */
export interface LayoutInput {
  /** Asunto: va como `<title>`. */
  subject: string;
  /** Frase útil que algunos clientes muestran junto al asunto; no se ve en el cuerpo. */
  preheader: string;
  /** Texto de la derecha de la banda de marca (tipo y fecha). */
  band: string;
  /** Franja bajo la banda: color de fondo y texto (severidad o tipo). `dark` pone el texto en lino. */
  strip: { color: string; text: string; dark?: boolean };
  /** Texto chico sobre el titular (estancia, organización). */
  context?: string;
  title: string;
  /** Frase bajo el titular: tiene que agregar algo que el titular no dice. */
  lead?: string;
  /** Bloques del cuerpo (widgets), en orden. */
  blocks?: Markup[];
  cta?: { label: string; url: string };
  /** Primera línea del pie, con un enlace opcional al final (ajustes de avisos). */
  footer: string;
  settings?: { label: string; url: string };
  /** Segunda línea del pie: atribución de los datos. */
  credit?: string;
}

const CSS = `@media (max-width: 480px) {
.px { padding-left: 20px !important; padding-right: 20px !important; }
.kpi { display: block !important; width: 100% !important; box-sizing: border-box; margin-bottom: 8px; }
.hide-sm { display: none !important; }
.h1 { font-size: 24px !important; line-height: 30px !important; }
}
@media (prefers-color-scheme: dark) {
.bg { background: #141813 !important; }
.card { background: #1C211A !important; border-color: #2E352B !important; }
.t1 { color: #EEEBE1 !important; }
.t2 { color: #B9B6AC !important; }
.soft { background: #232920 !important; }
.rule { border-color: #2E352B !important; }
.good { color: #9CC05A !important; }
.bad { color: #F08A74 !important; }
.lnk { color: #9CC05A !important; }
}`;

/** Documento HTML completo de un correo. */
export function renderLayout(i: LayoutInput): string {
  const hidden = "&#8199;&#847;".repeat(24);
  const font = `font-family:${SANS};`;
  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(i.subject)}</title>
<style>
${CSS}
</style>
</head>
<body style="margin:0;padding:0;background:${C.linen};" class="bg">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(i.preheader)}${hidden}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.linen};" class="bg">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="background:${C.furrow};border-radius:12px 12px 0 0;padding:18px 32px;" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${SERIF};font-size:22px;font-weight:700;color:${C.linen};">Yvy</td>
<td align="right" style="${font}font-size:13px;color:#B8BFA9;">${esc(i.band)}</td>
</tr></table>
</td></tr>
<tr><td style="background:${i.strip.color};padding:8px 32px;${font}font-size:13px;font-weight:600;color:${i.strip.dark ? C.linen : C.furrow};" class="px">${esc(i.strip.text)}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 12px 12px;padding:28px 32px 32px;" class="card px">
${i.context ? `<p style="margin:0 0 6px;${font}font-size:14px;color:${C.muted};" class="t2">${esc(i.context)}</p>` : ""}
<h1 style="margin:0 0 10px;font-family:${SERIF};font-size:30px;line-height:36px;font-weight:700;color:${C.furrow};" class="h1 t1">${esc(i.title)}</h1>
${i.lead ? `<p style="margin:0 0 24px;${font}font-size:16px;line-height:24px;color:${C.text2};" class="t2">${esc(i.lead)}</p>` : ""}
${(i.blocks ?? []).map((b) => b.text).join("\n")}
${i.cta ? button(i.cta.label, i.cta.url).text : ""}
</td></tr>
<tr><td style="padding:20px 32px 0;${font}font-size:12px;line-height:18px;color:#6B6F64;" class="px t2">
${esc(i.footer)}${i.settings ? ` <a href="${esc(i.settings.url)}" style="color:${C.soyDark};" class="lnk">${esc(i.settings.label)}</a>` : ""}${i.credit ? `<br>${esc(i.credit)}` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
