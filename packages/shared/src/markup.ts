/** Plantillas de HTML y XML con escape automático de los valores interpolados. */

/** Marcado ya armado: al incluirlo en `safeHtml` o `safeXml` no se vuelve a escapar. */
export class Markup {
  constructor(readonly text: string) {}
  toString(): string {
    return this.text;
  }
}

/** Marca un texto que ya es marcado válido (por ejemplo, un SVG ya renderizado). */
export const raw = (text: string): Markup => new Markup(text);

const escaper = (apos: string) => (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": apos, '"': "&quot;" })[c]!);

const render = (escape: (s: string) => string, v: unknown): string => {
  if (v instanceof Markup) return v.text;
  if (Array.isArray(v)) return v.map((x) => render(escape, x)).join("");
  return v === null || v === undefined || v === false ? "" : escape(String(v));
};

const tagged =
  (escape: (s: string) => string) =>
  (strings: TemplateStringsArray, ...values: unknown[]): Markup =>
    new Markup(strings.reduce((out, s, i) => out + (i > 0 ? render(escape, values[i - 1]) : "") + s, ""));

/** Plantilla HTML (`safeHtml`): cada valor interpolado se escapa, salvo otro marcado (`safeHtml`, `raw`) o una lista de ellos. */
export const safeHtml = tagged(escaper("&#39;"));
/** Igual que `safeHtml`, para XML (KML, ISOXML). */
export const safeXml = tagged(escaper("&apos;"));
