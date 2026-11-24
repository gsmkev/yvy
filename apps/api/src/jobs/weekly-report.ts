/**
 * Parte semanal por email: resumen de la semana de cada estancia con el PDF adjunto cuando está disponible,
 * y envío a destinatarios externos programados.
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB } from "../db/client";
import { SystemDb } from "../db/system";
import { sendEmail, type EmailAttachment } from "../lib/email";
import { presign } from "../lib/r2";
import type { Bindings } from "../types";
import type { Farm, JobDeps } from "./farm";

/** Parte semanal por email: resumen y enlace; el PDF lo arma workers-py y va adjunto; si todavía no está, se manda el enlace a la web. */
export async function weeklyReportJob(db: DB, env: Bindings, deps: JobDeps, farm: Farm): Promise<void> {
  const now = deps.now();
  const since = now - 7 * 86_400_000;
  const [stats] = await db
    .select({ n: sql<number>`count(*)`, authors: sql<number>`count(DISTINCT ${s.records.authorId})` })
    .from(s.records)
    .where(and(eq(s.records.farmId, farm.id), isNull(s.records.deletedAt), gte(s.records.capturedAt, since)));
  const [rain] = await db
    .select({ mm: sql<number | null>`sum(${s.climateDaily.precipMm})` })
    .from(s.climateDaily)
    .where(
      and(
        eq(s.climateDaily.farmId, farm.id),
        eq(s.climateDaily.plotId, ""),
        inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
        gte(s.climateDaily.date, localDate(since, farm.tz)),
      ),
    );
  const alerts = await db
    .select({ summary: s.alerts.summary })
    .from(s.alerts)
    .where(and(eq(s.alerts.farmId, farm.id), gte(s.alerts.updatedAt, since)));
  const recipients = await db
    .select({ email: s.users.email })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(
      and(
        eq(s.memberships.organizationId, farm.organizationId),
        inArray(s.memberships.role, ["owner", "admin"]),
        isNull(s.memberships.deletedAt),
      ),
    );
  const from = localDate(since, farm.tz);
  const to = localDate(now, farm.tz);
  const text = [
    `Parte semanal de ${farm.name} (${from} al ${to})`,
    "",
    `Registros: ${stats?.n ?? 0} de ${stats?.authors ?? 0} personas`,
    `Lluvia estimada (CHIRPS): ${rain?.mm != null ? `${Math.round(rain.mm)} mm` : "sin datos"}`,
    `Avisos: ${alerts.length ? alerts.map((a) => a.summary).join("; ") : "ninguno"}`,
    "",
    `PDF con mapa, tabla y fotos: ${env.APP_URL}/estancias/${farm.id}/parte?desde=${from}&hasta=${to}`,
  ].join("\n");
  // Si workers-py ya armó el PDF de la semana, va adjunto y con enlace (válido 7 días). Resend lo baja
  // desde la URL firmada de R2, así que el Worker no carga el archivo. Sin PDF (o sin credenciales) sale el texto.
  let attachments: EmailAttachment[] = [];
  let body = text;
  const pdf = await new SystemDb(db).latestWeeklyReport(farm.id, now, 3 * 86_400_000);
  if (pdf) {
    try {
      const url = await presign(env, "GET", pdf.storagePath, 7 * 86_400_000 / 1000);
      attachments = [{ filename: `parte-${farm.name}-${pdf.periodEnd}.pdf`.replace(/[^\w.-]+/g, "-"), path: url }];
      body = `${text}\n\nPDF del parte (el enlace vale 7 días): ${url}`;
    } catch (e) {
      console.error("no se pudo firmar el PDF semanal", e);
    }
  }
  for (const r of recipients) {
    if (r.email) await sendEmail(env, r.email, `Yvy · Parte semanal · ${farm.name}`, body, attachments);
  }
  await sendToExternalRecipients(db, env, farm, now, body, attachments);
}

/** Primer lunes del mes (hora de la estancia): el día del mes es ≤ 7. */
export const isFirstMondayOfMonth = (ms: number, tz: string): boolean => Number(localDate(ms, tz).slice(8)) <= 7;

/**
 * El mismo parte (texto y PDF) a los destinatarios externos que programó el dueño: socio, agrónomo, banco.
 * Los semanales lo reciben todos los lunes; los mensuales, solo el primer lunes del mes.
 */
async function sendToExternalRecipients(
  db: DB,
  env: Bindings,
  farm: Farm,
  now: number,
  body: string,
  attachments: EmailAttachment[],
): Promise<void> {
  const rows = await db
    .select()
    .from(s.reportSchedules)
    .where(
      and(
        eq(s.reportSchedules.organizationId, farm.organizationId),
        isNull(s.reportSchedules.deletedAt),
        sql`(${s.reportSchedules.farmId} IS NULL OR ${s.reportSchedules.farmId} = ${farm.id})`,
      ),
    );
  const due = rows.filter((r) => r.frequency === "weekly" || isFirstMondayOfMonth(now, farm.tz));
  if (!due.length) return;
  const [org] = await db
    .select({ name: s.organizations.name })
    .from(s.organizations)
    .where(eq(s.organizations.id, farm.organizationId))
    .limit(1);
  const text = `${org?.name ?? "Una organización"} te comparte este informe de ${farm.name} desde Yvy.\n\n${body}\n\nSi no querés seguir recibiéndolo, pedile a quien te lo programó que te quite de la lista.`;
  for (const r of due) {
    try {
      await sendEmail(env, r.email, `Yvy · Parte de ${farm.name} · ${org?.name ?? ""}`, text, attachments);
      await db.update(s.reportSchedules).set({ lastSentAt: now }).where(eq(s.reportSchedules.id, r.id));
    } catch (e) {
      console.error("informe programado", r.id, e);
    }
  }
}

