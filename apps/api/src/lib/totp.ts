/**
 * P-08: TOTP (RFC 6238 sobre HOTP de RFC 4226, HMAC-SHA1) con WebCrypto. Un código cuesta tres HMAC: barato en CPU.
 * El secreto se guarda cifrado con AES-GCM; la clave se deriva de JWT_SECRET, así que rotar JWT_SECRET obliga a
 * volver a dar de alta el segundo factor (igual que los PIN).
 */
import { hmacHex, hmacVerifyHex, sha256Hex } from "./crypto";

const enc = new TextEncoder();
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32 inválido");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export const newTotpSecret = (): string => base32Encode(crypto.getRandomValues(new Uint8Array(20)));

/** Código de `digits` dígitos para un contador (RFC 4226 §5.3). */
export async function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000));
  view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = h[19]! & 15;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

/**
 * Paso del contador que coincide con `code` dentro de ±1 paso (tolera el desfase de reloj del teléfono), o null.
 * Se miran los tres pasos siempre, para que el tiempo de respuesta no delate cuál acertó.
 */
export async function matchTotp(secretBase32: string, code: string, nowMs: number, digits = TOTP_DIGITS): Promise<number | null> {
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return null;
  const secret = base32Decode(secretBase32);
  const step = totpStep(nowMs);
  let hit: number | null = null;
  for (const s of [step - 1, step, step + 1]) if ((await hotp(secret, s, digits)) === code) hit = s;
  return hit;
}

export const otpauthUri = (secretBase32: string, account: string, issuer = "Yvy"): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;

// ---------- Códigos de recuperación ----------

/** Sin 0/O/1/I para poder dictarlos. 10 caracteres = 50 bits; se muestran como XXXXX-XXXXX. */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Forma canónica de lo que tipeó la persona (mayúsculas, sin guiones ni espacios); null si no parece un código. */
export function normalizeRecoveryCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{10}$/.test(raw) ? raw : null;
}

export const recoveryHash = (userId: string, normalized: string): Promise<string> => sha256Hex(`recovery:${userId}:${normalized}`);

// ---------- Pase entre el código de email y el segundo factor ----------

export interface TotpTicket {
  userId: string;
  organizationId?: string;
  deviceId?: string | null;
  exp: number;
}

const b64url = (s: string) => btoa(String.fromCharCode(...enc.encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** Pase firmado y corto que prueba que el código de email ya se verificó. No da sesión por sí solo. */
export async function signTicket(jwtSecret: string, t: TotpTicket): Promise<string> {
  const payload = b64url(JSON.stringify(t));
  return `${payload}.${await hmacHex(jwtSecret, `totp-ticket:${payload}`)}`;
}

export async function verifyTicket(jwtSecret: string, ticket: string, nowMs: number): Promise<TotpTicket | null> {
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig || !(await hmacVerifyHex(jwtSecret, `totp-ticket:${payload}`, sig))) return null;
  try {
    const t = JSON.parse(unb64url(payload)) as TotpTicket;
    return typeof t.userId === "string" && typeof t.exp === "number" && t.exp > nowMs ? t : null;
  } catch {
    return null;
  }
}
