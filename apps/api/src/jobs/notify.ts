/**
 * Envío de notificaciones pendientes (cron cada 15 min). Expo Push y Resend aceptan lotes, así que
 * cada corrida usa 2 subrequests. Email con tope diario (Resend gratis: 100/día).
 */
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { inQuietHours, localTime, parseNotificationPrefs, t, ATTRIBUTION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { chunkForParams, runBatch, type DB, type Stmt } from "../db/client";
import type { Bindings } from "../types";

const EMAIL_DAILY_CAP = 90;
const BATCH = 100;

const KIND_LABEL: Record<string, string> = {
  frost: "Helada",
  excess_rain: "Exceso de lluvia",
  drought: "Sequía",
  fire: "Fuego",
};
const PROB_LABEL: Record<string, string> = {
  low: "probabilidad baja",
  medium: "probabilidad media",
  high: "probabilidad alta",
};

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

/** Dispositivos con token de las personas a las que se les avisa (≤ 90 por consulta). */
const pushTokens = (db: DB, pushes: { userId: string }[]) =>
  db
    .select({ userId: s.devices.userId, token: s.devices.pushToken })
    .from(s.devices)
    .where(
      and(
        inArray(s.devices.userId, [...new Set(pushes.map((p) => p.userId))].slice(0, 90)),
        isNotNull(s.devices.pushToken),
      ),
    );

/** Un mensaje por dispositivo de cada aviso; `extra` pone lo propio de cada tipo de aviso. */
const pushMessages = <P extends { userId: string }>(
  pushes: P[],
  tokens: { userId: string; token: string | null }[],
  build: (p: P) => Record<string, unknown>,
) => pushes.flatMap((p) => tokens.filter((tk) => tk.userId === p.userId).map((tk) => ({ to: tk.token, ...build(p) })));

/** Expo Push acepta lotes de hasta 100 mensajes. */
const sendExpo = (fetchFn: typeof fetch, messages: unknown[]) =>
  fetchFn(EXPO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(messages.slice(0, 100)),
  });

/** Cuántos emails entran todavía hoy bajo el tope diario. */
async function emailRoom(db: DB, now: number): Promise<number> {
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)` })
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.channel, "email"),
        eq(s.notifications.status, "sent"),
        gte(s.notifications.sentAt, now - 86_400_000),
      ),
    )) as [{ n: number }];
  return Math.max(0, EMAIL_DAILY_CAP - n);
}

/** Marca como enviadas y fallidas las notificaciones (en tandas de 90 ids) y devuelve el conteo por canal. */
async function finish(
  db: DB,
  pending: { id: string; channel: string }[],
  sent: string[],
  failed: string[],
  now: number,
  before: Stmt[] = [],
): Promise<{ push: number; email: number }> {
  const stmts: Stmt[] = [...before];
  for (const chunk of chunkForParams(sent, 1))
    stmts.push(db.update(s.notifications).set({ status: "sent", sentAt: now }).where(inArray(s.notifications.id, chunk)));
  for (const chunk of chunkForParams(failed, 1))
    stmts.push(db.update(s.notifications).set({ status: "failed" }).where(inArray(s.notifications.id, chunk)));
  await runBatch(db, stmts);
  const done = (channel: string) => pending.filter((p) => p.channel === channel && sent.includes(p.id)).length;
  return { push: done("push"), email: done("email") };
}

/** Tokens que Expo marcó como DeviceNotRegistered (la respuesta trae un ticket por mensaje, en orden). */
async function deadTokens(res: Response, sentTo: (string | null)[]): Promise<string[]> {
  try {
    const json = (await res.json()) as { data?: { status?: string; details?: { error?: string } }[] };
    const out: string[] = [];
    json.data?.forEach((tk, i) => {
      const token = sentTo[i];
      if (token && tk.status === "error" && tk.details?.error === "DeviceNotRegistered") out.push(token);
    });
    return out;
  } catch {
    return [];
  }
}

/** Columnas comunes de las notificaciones pendientes (el resto depende del tipo de aviso). */
const notificationBase = {
  id: s.notifications.id,
  channel: s.notifications.channel,
  userId: s.notifications.userId,
  email: s.users.email,
};

/** Qué se envió bien y qué falló, y las sentencias de limpieza (tokens muertos). */
interface Outcome {
  sent: string[];
  failed: string[];
  cleanup: Stmt[];
}

/** El push dentro del horario de silencio del usuario (hora de la estancia) queda pendiente hasta que termine. */
async function dropHeldPushes<P extends { channel: string; userId: string; tz: string }>(db: DB, pending: P[], now: number): Promise<P[]> {
  const quiet = new Map<string, ReturnType<typeof parseNotificationPrefs>["quiet"]>();
  const pushUsers = [...new Set(pending.filter((p) => p.channel === "push").map((p) => p.userId))];
  for (const chunk of chunkForParams(pushUsers, 1)) {
    const found = await db
      .select({ userId: s.notificationPrefs.userId, prefs: s.notificationPrefs.prefs })
      .from(s.notificationPrefs)
      .where(inArray(s.notificationPrefs.userId, chunk));
    for (const f of found) quiet.set(f.userId, parseNotificationPrefs(f.prefs).quiet);
  }
  const held = (p: P) => {
    const q = quiet.get(p.userId);
    return p.channel === "push" && !!q && inQuietHours(q, localTime(now, p.tz));
  };
  return pending.filter((p) => !held(p));
}

type AlertNotice = {
  id: string;
  userId: string;
  email: string | null;
  alertId: string;
};
interface AlertText<P> {
  title: (p: P) => string;
  body: (p: P) => string;
}

/** Push de avisos agronómicos: un lote a Expo; los tokens que Expo marca inválidos se borran. */
async function pushAlerts<P extends AlertNotice>(db: DB, fetchFn: typeof fetch, pushes: P[], text: AlertText<P>, out: Outcome) {
  if (!pushes.length) return;
  const tokens = await pushTokens(db, pushes);
  const messages = pushMessages(pushes, tokens, (p) => ({
    title: text.title(p),
    body: text.body(p),
    data: { alertId: p.alertId },
    sound: "default",
    priority: "high",
  }));
  if (!messages.length) {
    out.sent.push(...pushes.map((p) => p.id)); // sin dispositivos: nada que mandar
    return;
  }
  const res = await sendExpo(fetchFn, messages);
  (res.ok ? out.sent : out.failed).push(...pushes.map((p) => p.id));
  if (!res.ok) return;
  // Expo responde 200 con un estado por mensaje; los tokens inválidos se borran.
  const dead = await deadTokens(
    res,
    messages.slice(0, 100).map((m) => m.to),
  );
  for (const chunk of chunkForParams(dead, 1))
    out.cleanup.push(db.update(s.devices).set({ pushToken: null }).where(inArray(s.devices.pushToken, chunk)));
}

/** Email de avisos agronómicos: en lote por Resend, con tope diario; sin clave (desarrollo) se imprime. */
async function emailAlerts<P extends AlertNotice>(
  db: DB,
  env: Bindings,
  fetchFn: typeof fetch,
  now: number,
  emails: P[],
  text: AlertText<P>,
  out: Outcome,
) {
  if (!emails.length) return;
  const room = await emailRoom(db, now);
  const toSend = emails.filter((e) => e.email).slice(0, room);
  out.sent.push(...emails.filter((e) => !e.email).map((e) => e.id));
  if (!toSend.length) return;
  if (!env.RESEND_API_KEY) {
    for (const e of toSend) console.log(`[email:dev] ${e.email}: ${text.title(e)} — ${text.body(e)}`);
    out.sent.push(...toSend.map((e) => e.id));
    return;
  }
  const res = await fetchFn("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(
      toSend.map((e) => ({
        from: env.EMAIL_FROM,
        to: e.email,
        subject: `Yvy · ${text.title(e)}`,
        text: `${text.body(e)}\n\n${t(ATTRIBUTION.metNorway)}`,
      })),
    ),
  });
  (res.ok ? out.sent : out.failed).push(...toSend.map((e) => e.id));
}

/**
 * Envía las notificaciones de avisos agronómicos pendientes (push por Expo, email por Resend) y las marca como
 * enviadas o fallidas. Los push dentro del horario de silencio del usuario quedan pendientes.
 * @returns cuántas notificaciones salieron por canal.
 */
export async function sendPending(
  db: DB,
  env: Bindings,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ push: number; email: number }> {
  const pending = await db
    .select({
      ...notificationBase,
      kind: s.alerts.kind,
      summary: s.alerts.summary,
      probability: s.alerts.probability,
      source: s.alerts.source,
      farmName: s.farms.name,
      tz: s.farms.timezone,
      alertId: s.alerts.id,
    })
    .from(s.notifications)
    .innerJoin(s.users, eq(s.users.id, s.notifications.userId))
    .innerJoin(s.alerts, eq(s.alerts.id, s.notifications.alertId))
    .innerJoin(s.farms, eq(s.farms.id, s.alerts.farmId))
    .where(eq(s.notifications.status, "pending"))
    .orderBy(asc(s.notifications.createdAt))
    .limit(BATCH * 3);
  const batch = (await dropHeldPushes(db, pending, now)).slice(0, BATCH);
  pending.length = 0;
  pending.push(...batch);
  if (!pending.length) return { push: 0, email: 0 };

  const title = (p: (typeof pending)[number]) => `${KIND_LABEL[p.kind] ?? p.kind} · ${p.farmName}`;
  const body = (p: (typeof pending)[number]) =>
    `${p.summary}${p.probability ? ` (${PROB_LABEL[p.probability]})` : ""}. Orientativo. Fuente: ${p.source}.`;

  const out: Outcome = { sent: [], failed: [], cleanup: [] };
  const text = { title, body };
  await pushAlerts(db, fetchFn, pending.filter((p) => p.channel === "push"), text, out);
  await emailAlerts(db, env, fetchFn, now, pending.filter((p) => p.channel === "email"), text, out);
  return finish(db, pending, out.sent, out.failed, now, out.cleanup);
}

/**
 * Avisos de mención en comentarios (push y email). Salen en la misma corrida de 15 min que los avisos
 * agronómicos; el email comparte el tope diario. Sin RESEND_API_KEY (desarrollo) el email se imprime.
 */
export async function sendMentions(
  db: DB,
  env: Bindings,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ push: number; email: number }> {
  const pending = await db
    .select({
      ...notificationBase,
      body: s.comments.body,
      author: s.comments.authorName,
      recordId: s.comments.recordId,
    })
    .from(s.notifications)
    .innerJoin(s.users, eq(s.users.id, s.notifications.userId))
    .innerJoin(s.comments, eq(s.comments.id, s.notifications.commentId))
    .where(and(eq(s.notifications.status, "pending"), isNotNull(s.notifications.commentId)))
    .orderBy(asc(s.notifications.createdAt))
    .limit(BATCH);
  if (!pending.length) return { push: 0, email: 0 };
  const title = (p: (typeof pending)[number]) => t("ui.common.mentionTitle", { name: p.author || "Alguien" });
  const sent: string[] = [];
  const failed: string[] = [];

  const pushes = pending.filter((p) => p.channel === "push");
  if (pushes.length) {
    const tokens = await pushTokens(db, pushes);
    const messages = pushMessages(pushes, tokens, (p) => ({
      title: title(p),
      body: p.body.slice(0, 140),
      data: { recordId: p.recordId },
      sound: "default",
    }));
    if (messages.length) {
      const res = await sendExpo(fetchFn, messages);
      (res.ok ? sent : failed).push(...pushes.map((p) => p.id));
    } else sent.push(...pushes.map((p) => p.id));
  }

  const emails = pending.filter((p) => p.channel === "email");
  if (emails.length) {
    const room = await emailRoom(db, now);
    sent.push(...emails.filter((e) => !e.email).map((e) => e.id));
    for (const e of emails.filter((x) => x.email).slice(0, room)) {
      const text = `${e.body}\n\n${env.APP_URL}/registros`;
      try {
        if (!env.RESEND_API_KEY) console.log(`[email:dev] ${e.email}: ${title(e)} — ${text}`);
        else {
          const res = await fetchFn("https://api.resend.com/emails", {
            method: "POST",
            headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ from: env.EMAIL_FROM, to: e.email, subject: `Yvy · ${title(e)}`, text }),
          });
          if (!res.ok) throw new Error(String(res.status));
        }
        sent.push(e.id);
      } catch {
        failed.push(e.id);
      }
    }
  }
  return finish(db, pending, sent, failed, now);
}
