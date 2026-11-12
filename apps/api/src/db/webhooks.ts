/**
 * I-02: webhooks. Gestión desde Cuenta (solo dueño y administrador, por ScopedDb) y, aparte, el lado del sistema:
 * armar los mensajes de la cola, vaciar el buzón de avisos y entregar con firma HMAC-SHA256.
 */
import { HTTPException } from "hono/http-exception";
import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import { LIMITS, newId, t, type WebhookEvent, type WebhookPayload } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { hmacHex, openSecret, randomToken, sealSecret } from "../lib/crypto";
import type { Bindings, JobMessage } from "../types";
import { chunkForParams, type DB, type Stmt } from "./client";
import { can, ForbiddenError, NotFoundError, type ScopedDb } from "./scoped";

/**
 * Solo https, con nombre de dominio público (nada de IP, localhost ni nombres internos) y sin usuario:clave.
 * Devuelve el motivo si no sirve, o null si está bien.
 */
export function webhookUrlProblem(raw: string): "invalid" | "not_https" | "private_host" | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "invalid";
  }
  if (u.protocol !== "https:") return "not_https";
  if (u.username || u.password) return "invalid";
  const h = u.hostname.toLowerCase();
  if (
    !h.includes(".") ||
    h.startsWith("[") ||
    /^\d+(\.\d+){3}$/.test(h) ||
    /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)
  )
    return "private_host";
  return null;
}

const MSG = "Solo dueño o administrador gestionan los webhooks";

type Endpoint = typeof s.webhookEndpoints.$inferSelect;

const view = (e: Endpoint) => ({
  id: e.id,
  url: e.url,
  events: JSON.parse(e.events) as WebhookEvent[],
  enabled: e.enabled,
  lastStatus: e.lastStatus,
  lastHttpStatus: e.lastHttpStatus,
  lastError: e.lastError,
  lastAttemptAt: e.lastAttemptAt,
  lastSuccessAt: e.lastSuccessAt,
  consecutiveFailures: e.consecutiveFailures,
  createdAt: e.createdAt,
});

const ownEndpoint = async (sdb: ScopedDb, id: string): Promise<Endpoint> => {
  const [e] = await sdb.db
    .select()
    .from(s.webhookEndpoints)
    .where(
      and(
        eq(s.webhookEndpoints.id, id),
        eq(s.webhookEndpoints.organizationId, sdb.auth.orgId),
        isNull(s.webhookEndpoints.deletedAt),
      ),
    )
    .limit(1);
  if (!e) throw new NotFoundError("No existe ese webhook");
  return e;
};

const writable = (sdb: ScopedDb) => {
  sdb.require(can.manageWebhooks, MSG);
  if (sdb.auth.readOnly) throw new ForbiddenError("Sesión de solo lectura");
};

export async function listWebhooks(sdb: ScopedDb) {
  sdb.require(can.manageWebhooks, MSG);
  const rows = await sdb.db
    .select()
    .from(s.webhookEndpoints)
    .where(and(eq(s.webhookEndpoints.organizationId, sdb.auth.orgId), isNull(s.webhookEndpoints.deletedAt)))
    .orderBy(asc(s.webhookEndpoints.createdAt))
    .limit(LIMITS.webhooks.maxPerOrg * 2);
  return rows.map(view);
}

/** Crea el webhook; el secreto de firma se devuelve una sola vez. */
export async function createWebhook(
  env: Pick<Bindings, "JWT_SECRET">,
  sdb: ScopedDb,
  url: string,
  events: WebhookEvent[],
  now = sdb.now(),
) {
  writable(sdb);
  const problem = webhookUrlProblem(url);
  if (problem) throw new HTTPException(400, { message: t(`ui.webhookUrl_${problem}` as const) });
  const existing = await listWebhooks(sdb);
  if (existing.length >= LIMITS.webhooks.maxPerOrg)
    throw new HTTPException(409, { message: t("ui.webhookLimit", { n: LIMITS.webhooks.maxPerOrg }) });
  const secret = `whsec_${randomToken(24)}`;
  const id = newId();
  await sdb.db.insert(s.webhookEndpoints).values({
    id,
    organizationId: sdb.auth.orgId,
    url,
    secretEnc: await sealSecret(env.JWT_SECRET, secret),
    events: JSON.stringify(events),
    createdBy: sdb.auth.userId,
    createdAt: now,
  });
  return { id, secret };
}

export async function updateWebhook(sdb: ScopedDb, id: string, patch: { enabled?: boolean; events?: WebhookEvent[] }) {
  writable(sdb);
  await ownEndpoint(sdb, id);
  await sdb.db
    .update(s.webhookEndpoints)
    .set({
      ...(patch.events ? { events: JSON.stringify(patch.events) } : {}),
      // Reactivar limpia la racha de fallos para no volver a pausarse al primer error
      ...(patch.enabled !== undefined ? { enabled: patch.enabled, ...(patch.enabled ? { consecutiveFailures: 0 } : {}) } : {}),
    })
    .where(eq(s.webhookEndpoints.id, id));
}

export async function deleteWebhook(sdb: ScopedDb, id: string) {
  writable(sdb);
  await ownEndpoint(sdb, id);
  await sdb.db.update(s.webhookEndpoints).set({ deletedAt: sdb.now(), enabled: false }).where(eq(s.webhookEndpoints.id, id));
}

/** Mensaje de cola con un evento de prueba para el webhook. */
export async function pingMessage(sdb: ScopedDb, id: string, now = sdb.now()): Promise<JobMessage> {
  writable(sdb);
  await ownEndpoint(sdb, id);
  return webhookMessage(id, {
    id: newId(),
    event: "ping",
    createdAt: now,
    organizationId: sdb.auth.orgId,
    data: { message: "Prueba de webhook de Yvy" },
  });
}

// ---------- Sistema ----------

export const webhookMessage = (endpointId: string, payload: WebhookPayload): JobMessage => ({
  type: "webhook",
  endpointId,
  payload: JSON.stringify(payload),
});

/** Webhooks activos de la organización que piden el evento. */
export async function endpointsFor(db: DB, orgId: string, event: WebhookEvent): Promise<{ id: string }[]> {
  const rows = await db
    .select({ id: s.webhookEndpoints.id, events: s.webhookEndpoints.events })
    .from(s.webhookEndpoints)
    .where(
      and(
        eq(s.webhookEndpoints.organizationId, orgId),
        eq(s.webhookEndpoints.enabled, true),
        isNull(s.webhookEndpoints.deletedAt),
      ),
    )
    .limit(LIMITS.webhooks.maxPerOrg * 2);
  return rows.filter((r) => (JSON.parse(r.events) as string[]).includes(event));
}

/** Pasa un evento a la cola, un mensaje por webhook que lo pida. Devuelve cuántos mensajes salieron. */
export async function enqueueEvent(
  env: Pick<Bindings, "JOBS">,
  db: DB,
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  now = Date.now(),
  eventId = newId(),
): Promise<number> {
  const targets = await endpointsFor(db, orgId, event);
  if (!targets.length) return 0;
  const payload: WebhookPayload = { id: eventId, event, createdAt: now, organizationId: orgId, data };
  await env.JOBS.sendBatch(targets.map((t) => ({ body: webhookMessage(t.id, payload) })));
  return targets.length;
}

/** Sentencias para el batch de un aviso nuevo: deja el evento en el buzón si algún webhook lo pide. */
export async function alertOutboxStmts(
  db: DB,
  orgId: string,
  data: Record<string, unknown>,
  now: number,
): Promise<Stmt[]> {
  if (!(await endpointsFor(db, orgId, "alert.created")).length) return [];
  return [
    db.insert(s.webhookOutbox).values({
      id: newId(),
      organizationId: orgId,
      event: "alert.created",
      payload: JSON.stringify(data),
      createdAt: now,
    }),
  ];
}

/** Cron de 15 minutos: pasa el buzón a la cola y lo vacía. Descarta lo que quedó viejo sin salir. */
export async function drainOutbox(env: Pick<Bindings, "JOBS">, db: DB, now = Date.now()): Promise<number> {
  const rows = await db.select().from(s.webhookOutbox).orderBy(asc(s.webhookOutbox.createdAt)).limit(30);
  let sent = 0;
  const done: string[] = [];
  for (const r of rows) {
    try {
      sent += await enqueueEvent(
        env,
        db,
        r.organizationId,
        r.event as WebhookEvent,
        JSON.parse(r.payload) as Record<string, unknown>,
        r.createdAt,
        r.id,
      );
      done.push(r.id);
    } catch (e) {
      console.error("[webhooks] buzón", r.id, e);
    }
  }
  for (const chunk of chunkForParams(done, 1)) await db.delete(s.webhookOutbox).where(inArray(s.webhookOutbox.id, chunk));
  await db.delete(s.webhookOutbox).where(lt(s.webhookOutbox.createdAt, now - LIMITS.webhooks.outboxRetentionMs));
  return sent;
}

export const webhookRetryDelay = (attempts: number): number => {
  const d = LIMITS.webhooks.retryDelaysSec;
  return d[Math.min(Math.max(attempts, 1), d.length) - 1]!;
};

/**
 * Entrega firmada. El encabezado `X-Yvy-Signature` es `t=<ms>,v1=<hex>` con
 * HMAC-SHA256(secreto, "<t>.<cuerpo>"). Lanza si no se pudo entregar, para que la cola reintente;
 * en cada intento queda anotado el último estado del webhook.
 */
export async function deliverWebhook(
  env: Pick<Bindings, "JWT_SECRET">,
  db: DB,
  msg: Extract<JobMessage, { type: "webhook" }>,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<void> {
  const [e] = await db.select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, msg.endpointId)).limit(1);
  if (!e || e.deletedAt || !e.enabled) return;
  const secret = await openSecret(env.JWT_SECRET, e.secretEnc);
  if (!secret) throw new Error("secreto de webhook ilegible");
  const payload = JSON.parse(msg.payload) as WebhookPayload;
  let status: number | null = null;
  let error: string | null = null;
  try {
    const signature = `t=${now},v1=${await hmacHex(secret, `${now}.${msg.payload}`)}`;
    const res = await fetchFn(e.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(LIMITS.webhooks.timeoutMs),
      headers: {
        "content-type": "application/json",
        "user-agent": "Yvy-Webhooks/1.0",
        "x-yvy-event": payload.event,
        "x-yvy-delivery": payload.id,
        "x-yvy-signature": signature,
      },
      body: msg.payload,
    });
    status = res.status;
    if (!(res.status >= 200 && res.status < 300)) error = `HTTP ${res.status}`;
    await res.body?.cancel().catch(() => {});
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 200) : "error de red";
  }
  const failures = error ? e.consecutiveFailures + 1 : 0;
  await db
    .update(s.webhookEndpoints)
    .set({
      lastStatus: error ? "error" : "ok",
      lastHttpStatus: status,
      lastError: error,
      lastAttemptAt: now,
      ...(error ? {} : { lastSuccessAt: now }),
      consecutiveFailures: failures,
      ...(failures >= LIMITS.webhooks.disableAfterFailures ? { enabled: false } : {}),
    })
    .where(eq(s.webhookEndpoints.id, e.id));
  if (error) throw new Error(`webhook ${e.id}: ${error}`);
}

