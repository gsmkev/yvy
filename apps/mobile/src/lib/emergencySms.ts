/**
 * F-30: SMS de emergencia. Arma el texto (coordenadas a 5 decimales, precisión y hora) y el enlace `sms:` que abre la
 * app de mensajes del celular con los contactos de emergencia. No usa datos: el GPS y el SMS andan con señal de voz.
 * Todo lo de acá es TS puro para poder probarlo; el GPS y Linking están en la pantalla (app/emergency.tsx).
 */
import { LIMITS, t } from "@yvy/shared";

export interface EmergencyContact {
  name: string;
  /** Solo dígitos, con "+" al comienzo si lo tenía. */
  phone: string;
}

export interface EmergencyFix {
  lat: number;
  lon: number;
  accuracy: number | null;
}

/** "+595 981 123-456" → "+595981123456". null si no parece un teléfono (6 a 15 dígitos). */
export function normalizeContactPhone(raw: string): string | null {
  const plus = raw.trim().startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 ? plus + digits : null;
}

/** Contactos guardados (JSON en el celular) → lista válida, sin repetidos y con el tope. Tolera datos rotos. */
export function parseContacts(raw: string | null | undefined): EmergencyContact[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: EmergencyContact[] = [];
  for (const c of list) {
    const phone = typeof c?.phone === "string" ? normalizeContactPhone(c.phone) : null;
    if (!phone || out.some((o) => o.phone === phone)) continue;
    out.push({ name: typeof c.name === "string" ? c.name.trim().slice(0, 60) : "", phone });
  }
  return out.slice(0, LIMITS.emergency.maxContacts);
}

/** Agrega un contacto. Devuelve la lista nueva, o el motivo si no se pudo. */
export function addContact(
  list: EmergencyContact[],
  name: string,
  rawPhone: string,
): { ok: true; list: EmergencyContact[] } | { ok: false; reason: "phone" | "duplicate" | "full" } {
  const phone = normalizeContactPhone(rawPhone);
  if (!phone) return { ok: false, reason: "phone" };
  if (list.some((c) => c.phone === phone)) return { ok: false, reason: "duplicate" };
  if (list.length >= LIMITS.emergency.maxContacts) return { ok: false, reason: "full" };
  return { ok: true, list: [...list, { name: name.trim().slice(0, 60), phone }] };
}

/** "-25.28123, -57.63456" */
export const coordsText = (fix: { lat: number; lon: number }): string => `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`;

/** Hora y fecha local corta: "14:32 del 12/11". */
export function whenText(at: number, tzOffsetMinutes = new Date(at).getTimezoneOffset()): string {
  const d = new Date(at - tzOffsetMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} del ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
}

/** Texto prearmado. Sin ubicación avisa que no se pudo tomar, pero igual sale con la hora. */
export function emergencyText(
  name: string,
  fix: EmergencyFix | null,
  at: number,
  tzOffsetMinutes?: number,
): string {
  const when = whenText(at, tzOffsetMinutes);
  const who = name.trim() || t("app.emergencyWhoFallback");
  if (!fix) return t("app.emergencySmsNoFix", { name: who, when });
  const accuracy =
    fix.accuracy !== null && Number.isFinite(fix.accuracy) && fix.accuracy > 0
      ? t("app.emergencySmsAccuracy", { m: Math.round(fix.accuracy) })
      : t("app.emergencySmsNoAccuracy");
  return t("app.emergencySms", {
    name: who,
    coords: coordsText(fix),
    accuracy,
    link: `https://maps.google.com/?q=${fix.lat.toFixed(5)},${fix.lon.toFixed(5)}`,
    when,
  });
}

/**
 * Enlace `sms:`. Android separa el cuerpo con "?" y los destinatarios con ","; iOS usa "&" y ";" (y el "/open" evita
 * que el sistema pierda el cuerpo). Sin contactos abre la app de mensajes con el texto para elegir a quién mandarlo.
 */
export function smsUrl(phones: string[], body: string, os: "ios" | "android" | string = "android"): string {
  const encoded = encodeURIComponent(body);
  if (os === "ios") return `sms:/open?addresses=${phones.map(encodeURIComponent).join(",")}&body=${encoded}`;
  return `sms:${phones.map(encodeURIComponent).join(",")}?body=${encoded}`;
}
