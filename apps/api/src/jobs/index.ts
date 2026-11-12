/**
 * Crons y cola (PRD-cloudflare §4.8). Cada mensaje de la cola = una estancia, para quedar bajo 10 ms de CPU.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { addDays, LIMITS, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { purgeApiRate } from "../db/api-tokens";
import { getDb, runBatch, type DB } from "../db/client";
import { dayOfYear } from "../db/queries";
import { SystemDb } from "../db/system";
import { sendEmail, type EmailAttachment } from "../lib/email";
import { presign } from "../lib/r2";
import type { Bindings, JobMessage } from "../types";
import { saveForecastStmts, saveHourlyStmts, upsertAlert } from "./alerts";
import { sendMentions, sendPending } from "./notify";
import { pestAlertDraft } from "./pests";
import { evaluateHeatStress } from "./heat";
import { plotForecastJob, plotsNeedingForecast } from "./plot-forecast";
import { evaluateRust } from "./rust";
import { evaluateDrought, evaluateExcessRain, evaluateFrost } from "./rules";
import { dailyFromMet, hourlyFromMet, dailyFromPower, fetchMet, powerUrl, type DailyForecast } from "./weather";

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

async function enqueuePerFarm(env: Bindings, type: Exclude<JobMessage["type"], "plot_forecast">): Promise<number> {
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
    case CRONS.forecast: {
      await enqueuePerFarm(env, "forecast");
      // C-03: estancias de más de 2.000 ha: un mensaje por lote
      const plots = await plotsNeedingForecast(getDb(env.DB));
      for (let i = 0; i < plots.length; i += 100) {
        await env.JOBS.sendBatch(
          plots.slice(i, i + 100).map((p) => ({ body: { type: "plot_forecast", ...p } satisfies JobMessage })),
        );
      }
      return;
    }
    case CRONS.drought:
      await enqueuePerFarm(env, "drought");
      await enqueuePerFarm(env, "pest");
      return;
    case CRONS.weeklyReports:
      await enqueuePerFarm(env, "weekly_report");
      return;
    case CRONS.notify:
      await sendPending(getDb(env.DB), env, deps.fetch, deps.now());
      await sendMentions(getDb(env.DB), env, deps.fetch, deps.now());
      return;
    case CRONS.maintenance:
      await new SystemDb(getDb(env.DB)).purgeExpiredAuth(deps.now());
      // P-03: los eventos de uso viejos se borran; los del embudo quedan
      await getDb(env.DB).run(
        sql`DELETE FROM events WHERE ts < ${deps.now() - LIMITS.events.retentionMs} AND name NOT IN ('signup', 'farm_created', 'plots_created', 'member_added', 'first_record')`,
      );
      await purgeApiRate(getDb(env.DB), deps.now());
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
    case "plot_forecast":
      await plotForecastJob(db, env, deps, farm, msg.plotId);
      return;
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
  const hours = hourlyFromMet(met, now, LIMITS.weather.hourlyHorizonHours);
  await runBatch(db, [
    ...saveForecastStmts(db, farm.id, now, days, LIMITS.weather.forecastRunsKept),
    ...saveHourlyStmts(db, farm.id, hours),
  ]);
  const runs = await recentRuns(db, farm.id, LIMITS.weather.forecastRunsKept);
  const today = localDate(now, farm.tz);
  const cfg = await new SystemDb(db).alertSettings(farm.id);
  // A-40: roya asiática solo si la estancia tiene soja
  const soy = await db
    .select({ id: s.plots.id })
    .from(s.plots)
    .where(
      and(eq(s.plots.farmId, farm.id), eq(s.plots.kind, "crop"), eq(s.plots.crop, "soja"), isNull(s.plots.deletedAt)),
    );
  for (const draft of [
    evaluateFrost(runs, today, cfg.frostTminC),
    evaluateExcessRain(days, today, cfg.excessRainMm24h),
    evaluateRust(hours, farm.tz, soy.map((p) => p.id)),
  ]) {
    if (draft) await upsertAlert(db, farm, draft, now);
  }
  // G-32: estrés térmico del ganado (THI). Solo para estancias con potreros, y el aviso es de los potreros.
  const heat = evaluateHeatStress(hours, now, farm.tz);
  if (heat) {
    const pastures = await db
      .select({ id: s.plots.id })
      .from(s.plots)
      .where(and(eq(s.plots.farmId, farm.id), eq(s.plots.kind, "pasture"), isNull(s.plots.deletedAt)));
    if (pastures.length) {
      heat.details.plotIds = pastures.map((p) => p.id);
      await upsertAlert(db, farm, heat, now);
    }
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
  await sendToExternalRecipients(db, env, farm, now, body, attachments);
}

/** Primer lunes del mes (hora de la estancia): el día del mes es ≤ 7. */
export const isFirstMondayOfMonth = (ms: number, tz: string): boolean => Number(localDate(ms, tz).slice(8)) <= 7;

/**
 * R-10: el mismo parte (texto y PDF) a los destinatarios externos que programó el dueño: socio, agrónomo, banco.
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
