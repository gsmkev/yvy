/**
 * Ingreso con Google (opcional).
 */
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { and, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../../db/client";
import { hmacHex, hmacVerifyHex, randomToken, sha256Hex } from "../../lib/crypto";
import { parse, readJson } from "../../lib/http";
import type { AppEnv } from "../../types";
import { deviceId, sessionOrChallenge } from "./shared";
import { Hono } from "hono";

/** Rutas de ingreso con Google. */
export const routes = new Hono<AppEnv>();

// ---------- Ingreso con Google ----------
// Opcional: sin GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET no existe. Solo entra quien ya tiene cuenta: se vincula por el
// email verificado por Google (no crea organizaciones). Flujo de código de autorización; el id_token llega directo del
// endpoint de Google por HTTPS, así que alcanza con revisar sus datos (aud, iss, exp, email_verified).

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_STATE_COOKIE = "yvy_g_state";
const GOOGLE_CODE_TTL_MS = 60_000;

const googleConfig = (env: AppEnv["Bindings"]) =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        id: env.GOOGLE_CLIENT_ID,
        secret: env.GOOGLE_CLIENT_SECRET,
        redirect: `${env.APP_URL.replace(/\/$/, "")}/auth/google/callback`,
      }
    : null;

/** El botón de la web se muestra solo si está configurado. */
routes.get("/google", (c) => c.json({ enabled: !!googleConfig(c.env) }));

routes.get("/google/start", async (c) => {
  const cfg = googleConfig(c.env);
  if (!cfg) throw new HTTPException(404, { message: "No existe" });
  const nonce = randomToken(16);
  const state = `${nonce}.${await hmacHex(c.env.JWT_SECRET, `gstate:${nonce}`)}`;
  setCookie(c, GOOGLE_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Lax",
    path: "/auth/google",
    maxAge: 600,
  });
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: cfg.id,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString(), 302);
});

/**
 * Lee y valida los datos del id_token sin verificar su firma (viene directo del endpoint de Google): emisor, audiencia, vencimiento y email verificado).
 * @returns el email en minúsculas y el `sub`, o null si el token no sirve.
 */
export function googleClaims(idToken: string, clientId: string, nowSec: number) {
  try {
    const part = idToken.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const c = z
      .object({
        iss: z.enum(["https://accounts.google.com", "accounts.google.com"]),
        aud: z.literal(clientId),
        exp: z.number().gt(nowSec),
        email: z.string().email(),
        email_verified: z.union([z.literal(true), z.literal("true")]),
        sub: z.string(),
      })
      .safeParse(json);
    return c.success ? { email: c.data.email.toLowerCase(), sub: c.data.sub } : null;
  } catch {
    return null;
  }
}

routes.get("/google/callback", async (c) => {
  const cfg = googleConfig(c.env);
  if (!cfg) throw new HTTPException(404, { message: "No existe" });
  const back = (qs: string) => c.redirect(`${c.env.APP_URL.replace(/\/$/, "")}/ingresar?${qs}`, 302);
  const nonce = getCookie(c, GOOGLE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_STATE_COOKIE, { path: "/auth/google" });
  const [stateNonce, sig] = (c.req.query("state") ?? "").split(".");
  const code = c.req.query("code");
  if (!nonce || nonce !== stateNonce || !sig || !(await hmacVerifyHex(c.env.JWT_SECRET, `gstate:${nonce}`, sig)))
    return back("google_error=state");
  if (!code) return back("google_error=denied");
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.id,
      client_secret: cfg.secret,
      redirect_uri: cfg.redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return back("google_error=exchange");
  const { id_token } = (await res.json()) as { id_token?: string };
  const claims = id_token ? googleClaims(id_token, cfg.id, Math.floor(Date.now() / 1000)) : null;
  if (!claims) return back("google_error=unverified");
  const db = getDb(c.env.DB);
  const [user] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, claims.email)).limit(1);
  if (!user) return back("google_error=no_account");
  // Código de un solo uso (60 s) que la web canjea por la sesión: los tokens no viajan en la URL.
  const exchange = randomToken(24);
  const now = Date.now();
  const [m] = await db
    .select({ orgId: s.memberships.organizationId })
    .from(s.memberships)
    .where(and(eq(s.memberships.userId, user.id), isNull(s.memberships.deletedAt), eq(s.memberships.status, "active")))
    .limit(1);
  if (!m) return back("google_error=no_org");
  await db.insert(s.linkCodes).values({
    id: newId(),
    organizationId: m.orgId,
    userId: user.id,
    codeHash: await sha256Hex(`google:${exchange}`),
    expiresAt: now + GOOGLE_CODE_TTL_MS,
    createdBy: user.id,
    createdAt: now,
  });
  return back(`google=${exchange}`);
});

routes.post("/google/exchange", async (c) => {
  const body = parse(z.object({ code: z.string().min(20).max(64), deviceId }), await readJson(c.req));
  const db = getDb(c.env.DB);
  const now = Date.now();
  const used = await db
    .update(s.linkCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(s.linkCodes.codeHash, await sha256Hex(`google:${body.code}`)),
        isNull(s.linkCodes.usedAt),
        gte(s.linkCodes.expiresAt, now),
      ),
    )
    .returning({ userId: s.linkCodes.userId, organizationId: s.linkCodes.organizationId });
  const link = used[0];
  if (!link) throw new HTTPException(401, { message: "Código inválido o vencido" });
  const out = await sessionOrChallenge(db, c.env.JWT_SECRET, link.userId, {
    organizationId: link.organizationId,
    deviceId: body.deviceId,
    now,
  });
  if (!out) throw new HTTPException(403, { message: "No pertenecés a ninguna organización activa" });
  return c.json("session" in out ? out.session : out.challenge);
});
