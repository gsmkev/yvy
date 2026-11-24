/**
 * Programa para agrónomos: código personal de referido, derivado del id de usuario (UUID).
 * Son los últimos 8 caracteres hexadecimales en mayúsculas; en un UUIDv7 salen de la parte aleatoria.
 * No se guarda: se recalcula, y al registrarse con `?ref=` se busca al usuario cuyo id termina así.
 */

/** Formato de un código de referido: 8 caracteres hexadecimales en mayúsculas. */
export const REFERRAL_CODE_RE = /^[0-9A-F]{8}$/;

/** Código de referido de un usuario: los últimos 8 caracteres de su id, en mayúsculas. */
export function referralCode(userId: string): string {
  return userId.replace(/-/g, "").slice(-8).toUpperCase();
}

/** Código válido en mayúsculas, o null si lo que llegó no tiene la forma esperada. */
export function parseReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}
