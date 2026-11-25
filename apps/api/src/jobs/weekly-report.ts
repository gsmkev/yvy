/**
 * Parte semanal por email: resumen de la semana de cada estancia con el PDF adjunto cuando está disponible,
 * y envío a destinatarios externos programados.
 */
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB } from "../db/client";
import { SystemDb } from "../db/system";
import { sendEmail, weeklyEmail, type EmailAttachment, type WeeklyEmailInput } from "../lib/email";
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
  const byKind = await db
    .select({ kind: s.records.kind, n: sql<number>`count(*)` })
    .from(s.records)
    .where(and(eq(s.records.farmId, farm.id), isNull(s.records.deletedAt), gte(s.records.capturedAt, since)))
    .groupBy(s.records.kind)
    .orderBy(sql`count(*) DESC`)
    .limit(5);
  const [overdue] = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.tasks)
    .where(
      and(
        eq(s.tasks.farmId, farm.id),
        eq(s.tasks.status, "open"),
        isNull(s.tasks.deletedAt),
        lt(s.tasks.dueDate, localDate(now, farm.tz)),
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
  const data: Omit<WeeklyEmailInput, "hasPdf" | "pdfUrl" | "externalOrg"> = {
    farmId: farm.id,
    farmName: farm.name,
    from,
    to,
    records: stats?.n ?? 0,
    authors: stats?.authors ?? 0,
    rainMm: rain?.mm != null ? Math.round(rain.mm) : null,
    alerts: alerts.map((a) => a.summary),
    prevRecords: null,
    rainDaily: [],
    tasksDone: 0,
    tasksTotal: 0,
    worsened: [],
    overdueTasks: overdue?.n ?? 0,
    byKind: byKind.map((k) => ({ kind: k.kind, n: k.n })),
    appUrl: env.APP_URL,
  };
  // Si workers-py ya armó el PDF de la semana, va adjunto y con enlace (válido 7 días). Resend lo baja
  // desde la URL firmada de R2, así que el Worker no carga el archivo. Sin PDF (o sin credenciales) sale el texto.
  let attachments: EmailAttachment[] = [];
  let pdfUrl: string | undefined;
  const pdf = await new SystemDb(db).latestWeeklyReport(farm.id, now, 3 * 86_400_000);
  if (pdf) {
    try {
      const url = await presign(env, "GET", pdf.storagePath, 7 * 86_400_000 / 1000);
      attachments = [{ filename: `parte-${farm.name}-${pdf.periodEnd}.pdf`.replace(/[^\w.-]+/g, "-"), path: url }];
      pdfUrl = url;
    } catch (e) {
      console.error("no se pudo firmar el PDF semanal", e);
    }
  }
  const report = { ...data, hasPdf: attachments.length > 0, pdfUrl };
  for (const r of recipients) {
    if (r.email) await sendEmail(env, r.email, weeklyEmail(report), attachments);
  }
  await sendToExternalRecipients(db, env, farm, now, report, attachments);
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
  report: Omit<WeeklyEmailInput, "externalOrg">,
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
  const message = weeklyEmail({ ...report, externalOrg: org?.name ?? "Una organización" });
  for (const r of due) {
    try {
      await sendEmail(env, r.email, message, attachments);
      await db.update(s.reportSchedules).set({ lastSentAt: now }).where(eq(s.reportSchedules.id, r.id));
    } catch (e) {
      console.error("informe programado", r.id, e);
    }
  }
}

