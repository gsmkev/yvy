/**
 * PIN de empleados (F-24). Nada de bcrypt/scrypt (10 ms de CPU): SHA-256 con sal propia por usuario y el secreto del
 * servidor como pimienta. Un PIN de 6 dígitos tiene solo un millón de combinaciones, así que la defensa real es el
 * bloqueo por intentos (LIMITS.auth.pinMaxAttempts) y la pimienta: con la base filtrada y sin el secreto no se puede
 * probar nada. Cambiar JWT_SECRET invalida los PIN (hay que volver a fijarlos).
 */
import { sha256Hex } from "./crypto";

export const hashPin = (pepper: string, salt: string, pin: string): Promise<string> => sha256Hex(`${salt}:${pepper}:${pin}`);

/** Comparación en tiempo constante de dos hex del mismo largo. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
