/** Ingreso con teléfono y PIN para empleados (F-24): normalización del teléfono y reglas del PIN. Compartido por Worker, web y app. */

/**
 * Clave de búsqueda de un teléfono: solo dígitos, con prefijo de país. "0981 123 456", "+595 981 123456" y
 * "595981123456" dan la misma clave. Sin país se asume Paraguay (595). null si no parece un teléfono.
 */
export function phoneKey(raw: string): string | null {
  const hadPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!hadPlus && digits.startsWith("0")) digits = `595${digits.slice(1)}`;
  else if (!hadPlus && digits.length === 9 && digits.startsWith("9")) digits = `595${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export const PIN_LENGTH = 6;
export const PIN_REGEX = /^\d{6}$/;

/** PINs que un dueño no debería poner: repetidos (111111) o en escalera (123456, 654321). */
export function isWeakPin(pin: string): boolean {
  if (!PIN_REGEX.test(pin)) return true;
  if (new Set(pin).size === 1) return true;
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((n, i) => n - d[i]!);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}
