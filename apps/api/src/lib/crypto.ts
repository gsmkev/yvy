/**
 * Criptografía barata en CPU (WebCrypto): SHA-256, HMAC y JWT HS256.
 * Nada de bcrypt/scrypt: el plan gratis da 10 ms de CPU por request.
 */
const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const sha256Hex = async (s: string): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export const randomToken = (bytes = 32): string => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** Código numérico uniforme de n dígitos. */
export const randomDigits = (n: number): string => {
  const max = 10 ** n;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return String(buf[0]! % max).padStart(n, "0");
};

const keyCache = new Map<string, Promise<CryptoKey>>();
const hmacKey = (secret: string): Promise<CryptoKey> => {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    keyCache.set(secret, k);
  }
  return k;
};

export const hmacHex = async (secret: string, data: string): Promise<string> =>
  toHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)));

export const hmacVerifyHex = async (secret: string, data: string, sigHex: string): Promise<boolean> => {
  if (!/^[0-9a-f]{64}$/.test(sigHex)) return false;
  const sig = Uint8Array.from(sigHex.match(/../g)!, (h) => parseInt(h, 16));
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(data));
};

export interface JwtClaims {
  sub: string;
  org: string;
  role: string;
  iat: number;
  exp: number;
  /** P-12: sesión de soporte de solo lectura. `sup` es el usuario del equipo que la pidió. */
  ro?: boolean;
  sup?: string;
}

const JWT_HEADER = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));

export const signJwt = async (secret: string, claims: JwtClaims): Promise<string> => {
  const body = `${JWT_HEADER}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
};

export const verifyJwt = async (secret: string, token: string, nowSec: number): Promise<JwtClaims | null> => {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== JWT_HEADER) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(parts[2]!),
      enc.encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]!))) as JwtClaims;
    return typeof claims.exp === "number" && claims.exp > nowSec ? claims : null;
  } catch {
    return null;
  }
};
