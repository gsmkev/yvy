/** Fecha de un campo dd/mm/aaaa: conversión desde y hacia ISO (aaaa-mm-dd), sin zonas horarias. */

/** "2026-11-12" → "12/11/2026"; lo que no es una fecha ISO queda vacío. */
export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "12/11/2026" → "2026-11-12"; null si falta algo o el día no existe (31/02). */
export function displayToIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Mientras se escribe: deja solo dígitos y pone las barras ("1211" → "12/11/"). */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const out = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
  return digits.length === 2 || digits.length === 4 ? `${out}/` : out;
}
