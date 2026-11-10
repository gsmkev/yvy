/**
 * Envío de notificaciones pendientes (cron cada 15 min). Expo Push y Resend aceptan lotes, así que
 * cada corrida usa 2 subrequests. Email con tope diario (Resend gratis: 100/día).
 */
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch, type DB, type Stmt } from "../db/client";
import type { Bindings } from "../types";

export const EMAIL_DAILY_CAP = 90;
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

export async function sendPending(
  db: DB,
  env: Bindings,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ push: number; email: number }> {
  const pending = await db
    .select({
      id: s.notifications.id,
      channel: s.notifications.channel,
      userId: s.notifications.userId,
      email: s.users.email,
      kind: s.alerts.kind,
      summary: s.alerts.summary,
      probability: s.alerts.probability,
      source: s.alerts.source,
      farmName: s.farms.name,
      alertId: s.alerts.id,
    })
    .from(s.notifications)
    .innerJoin(s.users, eq(s.users.id, s.notifications.userId))
    .innerJoin(s.alerts, eq(s.alerts.id, s.notifications.alertId))
    .innerJoin(s.farms, eq(s.farms.id, s.alerts.farmId))
    .where(eq(s.notifications.status, "pending"))
    .orderBy(asc(s.notifications.createdAt))
    .limit(BATCH);
  if (!pending.length) return { push: 0, email: 0 };

  const title = (p: (typeof pending)[number]) => `${KIND_LABEL[p.kind] ?? p.kind} · ${p.farmName}`;
  const body = (p: (typeof pending)[number]) =>
    `${p.summary}${p.probability ? ` (${PROB_LABEL[p.probability]})` : ""}. Orientativo. Fuente: ${p.source}.`;

  const sent: string[] = [];
  const failed: string[] = [];
  const cleanup: Stmt[] = [];

  // ---- Push ----
  const pushes = pending.filter((p) => p.channel === "push");
  if (pushes.length) {
    const tokens = await db
      .select({ userId: s.devices.userId, token: s.devices.pushToken })
      .from(s.devices)
      .where(
        and(
          inArray(s.devices.userId, [...new Set(pushes.map((p) => p.userId))].slice(0, 90)),
          isNotNull(s.devices.pushToken),
        ),
      );
    const messages = pushes.flatMap((p) =>
      tokens
        .filter((tk) => tk.userId === p.userId)
        .map((tk) => ({
          to: tk.token,
          title: title(p),
          body: body(p),
          data: { alertId: p.alertId },
          sound: "default",
          priority: "high",
        })),
    );
    if (messages.length) {
      const res = await fetchFn("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messages.slice(0, 100)),
      });
      (res.ok ? sent : failed).push(...pushes.map((p) => p.id));
      if (res.ok) {
        // B9: Expo responde 200 con un estado por mensaje; los tokens inválidos se borran.
        const dead = await deadTokens(res, messages.slice(0, 100).map((m) => m.to));
        for (let i = 0; i < dead.length; i += 90)
          cleanup.push(db.update(s.devices).set({ pushToken: null }).where(inArray(s.devices.pushToken, dead.slice(i, i + 90))));
      }
    } else {
      sent.push(...pushes.map((p) => p.id)); // sin dispositivos: nada que mandar
    }
  }

  // ---- Email ----
  const emails = pending.filter((p) => p.channel === "email");
  if (emails.length) {
    const since = now - 86_400_000;
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)` })
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.channel, "email"),
          eq(s.notifications.status, "sent"),
          gte(s.notifications.sentAt, since),
        ),
      )) as [{ n: number }];
    const room = Math.max(0, EMAIL_DAILY_CAP - n);
    const toSend = emails.filter((e) => e.email).slice(0, room);
    const skipped = emails.filter((e) => !e.email).map((e) => e.id);
    sent.push(...skipped);
    if (toSend.length) {
      if (!env.RESEND_API_KEY) {
        for (const e of toSend) console.log(`[email:dev] ${e.email}: ${title(e)} — ${body(e)}`);
        sent.push(...toSend.map((e) => e.id));
      } else {
        const res = await fetchFn("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify(
            toSend.map((e) => ({
              from: env.EMAIL_FROM,
              to: e.email,
              subject: `Yvy · ${title(e)}`,
              text: `${body(e)}\n\n${t("attribution.metNorway")}`,
            })),
          ),
        });
        (res.ok ? sent : failed).push(...toSend.map((e) => e.id));
      }
    }
  }

  const stmts: Stmt[] = [...cleanup];
  for (let i = 0; i < sent.length; i += 90)
    stmts.push(
      db
        .update(s.notifications)
        .set({ status: "sent", sentAt: now })
        .where(inArray(s.notifications.id, sent.slice(i, i + 90))),
    );
  for (let i = 0; i < failed.length; i += 90)
    stmts.push(
      db
        .update(s.notifications)
        .set({ status: "failed" })
        .where(inArray(s.notifications.id, failed.slice(i, i + 90))),
    );
  await runBatch(db, stmts);
  return {
    push: pushes.filter((p) => sent.includes(p.id)).length,
    email: emails.filter((e) => sent.includes(e.id)).length,
  };
}
