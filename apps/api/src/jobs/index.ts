/**
 * Crons y cola (PRD-cloudflare §4.8). Cada mensaje de la cola = una estancia, para quedar bajo 10 ms de CPU.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { addDays, LIMITS, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb, runBatch, type DB } from "../db/client";
import { dayOfYear } from "../db/queries";
import { SystemDb } from "../db/system";
import { sendEmail, type EmailAttachment } from "../lib/email";
import { presign } from "../lib/r2";
import type { Bindings, JobMessage } from "../types";
import { saveForecastStmts, upsertAlert } from "./alerts";
import { sendPending } from "./notify";
import { pestAlertDraft } from "./pests";
import { evaluateDrought, evaluateExcessRain, evaluateFrost } from "./rules";
import { dailyFromMet, dailyFromPower, fetchMet, powerUrl, type DailyForecast } from "./weather";

export const CRONS = {
  forecast: "0 */3 * * *",
  drought: "0 11 * * *",
  notify: "*/15 * * * *",
  weeklyReports: "0 10 * * 1",
  maintenance: "0 3 * * *",
} as const;

export interface JobDeps {
  fetch: typeof fetch;
  now: () => number;
}

const defaultDeps = (): JobDeps => ({ fetch: (...a) => fetch(...a), now: Date.now });

async function enqueuePerFarm(env: Bindings, type: JobMessage["type"]): Promise<number> {
  const farms = await new SystemDb(getDb(env.DB)).activeFarms();
  for (let i = 0; i < farms.length; i += 100) {
    await env.JOBS.sendBatch(
      farms.slice(i, i + 100).map((f) => ({ body: { type, farmId: f.id } satisfies JobMessage })),
    );
  }
  return farms.length;
}

export async function scheduled(controller: { cron: string }, env: Bindings, deps = defaultDeps()): Promise<void> {
  switch (controller.cron) {
    case CRONS.forecast:
      await enqueuePerFarm(env, "forecast");
      return;
    case CRONS.drought:
      await enqueuePerFarm(env, "drought");
      await enqueuePerFarm(env, "pest");
      return;
    case CRONS.weeklyReports:
      await enqueuePerFarm(env, "weekly_report");
      return;
    case CRONS.notify:
      await sendPending(getDb(env.DB), env, deps.fetch, deps.now());
      return;
    case CRONS.maintenance:
      await new SystemDb(getDb(env.DB)).purgeExpiredAuth(deps.now());
      await recordUsage(env, deps.now());
      return;
  }
}

export async function runJob(msg: JobMessage, env: Bindings, deps = defaultDeps()): Promise<void> {
  const db = getDb(env.DB);
  const [farm] = await db
    .select({
      id: s.farms.id,
      organizationId: s.farms.organizationId,
      name: s.farms.name,
      lat: s.farms.centroidLat,
      lon: s.farms.centroidLon,
      tz: s.farms.timezone,
    })
    .from(s.farms)
    .where(and(eq(s.farms.id, msg.farmId), isNull(s.farms.deletedAt)))
    .limit(1);
  if (!farm) return;
  switch (msg.type) {
    case "forecast":
      return forecastJob(db, env, deps, farm);
    case "drought":
      return droughtJob(db, deps, farm);
    case "weekly_report":
      return weeklyReportJob(db, env, deps, farm);
    case "pest":
      return pestJob(db, deps, farm);
  }
}

export async function queue(batch: MessageBatch<JobMessage>, env: Bindings): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await runJob(msg.body, env);
      msg.ack();
    } catch (err) {
      console.error(`[job] ${msg.body.type} farm=${msg.body.farmId}`, err);
      msg.retry({ delaySeconds: 600 });
    }
  }
}

type Farm = { id: string; organizationId: string; name: string; lat: number; lon: number; tz: string };

async function recentRuns(db: DB, farmId: string, limit: number): Promise<DailyForecast[][]> {
  const runs = await db
    .selectDistinct({ runAt: s.forecasts.runAt })
    .from(s.forecasts)
    .where(eq(s.forecasts.farmId, farmId))
    .orderBy(desc(s.forecasts.runAt))
    .limit(limit);
  if (!runs.length) return [];
  const rows = await db
    .select()
    .from(s.forecasts)
    .where(
      and(
        eq(s.forecasts.farmId, farmId),
        inArray(
          s.forecasts.runAt,
          runs.map((r) => r.runAt),
        ),
      ),
    );
  return runs.map((r) =>
    rows
      .filter((x) => x.runAt === r.runAt)
      .map((x) => ({
        date: x.validDate,
        tminC: x.tminC,
        tmaxC: x.tmaxC,
        precipMm: x.precipMm ?? 0,
        windKmh: x.windKmh,
        windDirDeg: x.windDirDeg,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
}

/** Pronóstico MET Norway → helada y exceso de lluvia. */
async function forecastJob(db: DB, env: Bindings, deps: JobDeps, farm: Farm): Promise<void> {
  const now = deps.now();
  const met = await fetchMet(deps.fetch, env.MET_USER_AGENT, farm.lat, farm.lon);
  const days = dailyFromMet(met, farm.tz);
  await runBatch(db, saveForecastStmts(db, farm.id, now, days, LIMITS.weather.forecastRunsKept));
  const runs = await recentRuns(db, farm.id, LIMITS.weather.forecastRunsKept);
  const today = localDate(now, farm.tz);
  const cfg = await new SystemDb(db).alertSettings(farm.id);
  for (const draft of [
    evaluateFrost(runs, today, cfg.frostTminC),
    evaluateExcessRain(days, today, cfg.excessRainMm24h),
  ]) {
    if (draft) await upsertAlert(db, farm, draft, now);
  }
}

/** NASA POWER (temperatura y humedad del suelo) → sequía, cruzando CHIRPS y climatología. */
async function droughtJob(db: DB, deps: JobDeps, farm: Farm): Promise<void> {
  const now = deps.now();
  const today = localDate(now, farm.tz);
  const res = await deps.fetch(powerUrl(farm.lat, farm.lon, addDays(today, -14), today));
  if (!res.ok) throw new Error(`NASA POWER ${res.status}`);
  const power = dailyFromPower((await res.json()) as Parameters<typeof dailyFromPower>[0]);
  if (power.length) {
    await new SystemDb(db).upsertClimateDaily(
      power.map((d) => ({
        farmId: farm.id,
        plotId: "",
        date: d.date,
        source: "nasa_power",
        tminC: d.tminC,
        tmaxC: d.tmaxC,
        soilMoisture0_7: d.soilTop,
        soilMoisture7_28: d.soilRoot,
      })),
    );
  }
  const from30 = addDays(today, -30);
  const [rain] = await db
    .select({ mm: sql<number | null>`sum(${s.climateDaily.precipMm})`, n: sql<number>`count(*)` })
    .from(s.climateDaily)
    .where(
      and(
        eq(s.climateDaily.farmId, farm.id),
        eq(s.climateDaily.plotId, ""),
        inArray(s.climateDaily.source, ["chirps", "chirps_prelim"]),
        gte(s.climateDaily.date, from30),
      ),
    );
  const doys = Array.from({ length: 30 }, (_, i) => dayOfYear(addDays(today, -i)));
  const clim = await db
    .select()
    .from(s.climatology)
    .where(
      and(eq(s.climatology.farmId, farm.id), eq(s.climatology.plotId, ""), inArray(s.climatology.dayOfYear, doys)),
    );
  const normal30 = clim.filter((c) => c.variable === "precip").reduce((a, c) => a + (c.mean ?? 0), 0);
  const soilP20 = clim.find((c) => c.variable === "soil_top" && c.dayOfYear === dayOfYear(today))?.p20 ?? null;
  const soilNow = [...power].reverse().find((d) => d.soilTop !== null)?.soilTop ?? null;
  const [latest] = await recentRuns(db, farm.id, 1);
  const cfg = await new SystemDb(db).alertSettings(farm.id);
  const draft = evaluateDrought(
    {
      today,
      // Exigimos al menos 25 de 30 días de CHIRPS para no avisar con datos incompletos.
      rain30: rain && rain.n >= 25 ? (rain.mm ?? 0) : null,
      normal30: normal30 || null,
      soilNow,
      soilP20,
      forecast: latest ?? [],
    },
    cfg.droughtDeficitPct,
  );
  if (draft) await upsertAlert(db, farm, draft, now);
}

/** Monitoreos de plagas de los últimos 7 días contra el umbral por plaga (A-41). */
async function pestJob(db: DB, deps: JobDeps, farm: Farm): Promise<void> {
  const now = deps.now();
  const draft = await pestAlertDraft(db, farm.id, now, localDate(now, farm.tz));
  if (draft) await upsertAlert(db, farm, draft, now);
}

/** Parte semanal por email (RF-83): resumen y enlace; el PDF lo arma workers-py (R-02) y va adjunto; si todavía no está, se manda el enlace a la web. */
async function weeklyReportJob(db: DB, env: Bindings, deps: JobDeps, farm: Farm): Promise<void> {
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
  // R-02: si workers-py ya armó el PDF de la semana, va adjunto y con enlace (válido 7 días). Resend lo baja
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
}

/** Uso diario y aviso al 70 % de los límites del plan gratis (anexo §6). */
async function recordUsage(env: Bindings, now: number): Promise<void> {
  const db = getDb(env.DB);
  const day = localDate(now);
  const meta = await env.DB.prepare("SELECT 1").run();
  const dbBytes = Number(meta.meta.size_after ?? 0);
  const [photos] = await db
    .select({ bytes: sql<number>`coalesce(sum(${s.attachments.bytes}), 0)` })
    .from(s.attachments)
    .where(eq(s.attachments.uploadStatus, "uploaded"));
  const metrics = [
    { metric: "d1_bytes", value: dbBytes, limit: 500 * 1024 * 1024 },
    { metric: "r2_photo_bytes", value: photos?.bytes ?? 0, limit: 10 * 1024 ** 3 },
  ];
  await db
    .insert(s.usageDaily)
    .values(metrics.map((m) => ({ day, ...m })))
    .onConflictDoUpdate({ target: [s.usageDaily.day, s.usageDaily.metric], set: { value: sql`excluded.value` } });
  const over = metrics.filter((m) => m.value >= m.limit * LIMITS.storage.usageWarnRatio);
  if (over.length && env.OPS_EMAIL) {
    await sendEmail(
      env,
      env.OPS_EMAIL,
      "Yvy · Uso cerca del límite gratis",
      over.map((m) => `${m.metric}: ${Math.round((m.value / m.limit) * 100)} %`).join("\n"),
    );
  }
}
