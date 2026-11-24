/**
 * Crons y cola (PRD-cloudflare §4.8). Cada mensaje de la cola = una estancia, para quedar bajo 10 ms de CPU.
 * El despacho es por tabla: CRON_HANDLERS por expresión cron y JOB_HANDLERS por tipo de mensaje.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { LIMITS, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { purgeApiRate } from "../db/api-tokens";
import { deliverWebhook, drainOutbox, webhookRetryDelay } from "../db/webhooks";
import { getDb } from "../db/client";
import { SystemDb } from "../db/system";
import type { Bindings, JobMessage } from "../types";
import { archiveOld } from "./archive";
import { benchmarkJob } from "./benchmark";
import { droughtJob } from "./drought";
import type { Farm, JobDeps } from "./farm";
import { forecastJob } from "./forecast";
import { sendMentions, sendPending } from "./notify";
import { pestJob } from "./pests";
import { plotForecastJob, plotsNeedingForecast } from "./plot-forecast";
import { senacsaJob } from "./senacsa";
import { recordUsage } from "./usage";
import { weeklyReportJob } from "./weekly-report";

export { isFirstMondayOfMonth } from "./weekly-report";

export const CRONS = {
  forecast: "0 */3 * * *",
  drought: "0 11 * * *",
  notify: "*/15 * * * *",
  weeklyReports: "0 10 * * 1",
  maintenance: "0 3 * * *",
} as const;

const defaultDeps = (): JobDeps => ({ fetch: (...a) => fetch(...a), now: Date.now });

type FarmJobType = Exclude<JobMessage["type"], "plot_forecast" | "webhook">;

/** Manda mensajes a la cola de a 100 (el máximo de sendBatch). */
async function sendInBatches<T>(env: Bindings, items: T[], toBody: (item: T) => JobMessage): Promise<void> {
  for (let i = 0; i < items.length; i += 100) {
    await env.JOBS.sendBatch(items.slice(i, i + 100).map((item) => ({ body: toBody(item) })));
  }
}

async function enqueuePerFarm(env: Bindings, type: FarmJobType): Promise<number> {
  const farms = await new SystemDb(getDb(env.DB)).activeFarms();
  await sendInBatches(env, farms, (f) => ({ type, farmId: f.id }));
  return farms.length;
}

const enqueueAll =
  (...types: FarmJobType[]) =>
  async (env: Bindings) => {
    for (const type of types) await enqueuePerFarm(env, type);
  };

/** C-03: estancias de más de 2.000 ha: un mensaje por lote. */
async function enqueueForecasts(env: Bindings): Promise<void> {
  await enqueuePerFarm(env, "forecast");
  const plots = await plotsNeedingForecast(getDb(env.DB));
  await sendInBatches(env, plots, (p) => ({ type: "plot_forecast", ...p }));
}

async function notifyCron(env: Bindings, deps: JobDeps): Promise<void> {
  await sendPending(getDb(env.DB), env, deps.fetch, deps.now());
  await sendMentions(getDb(env.DB), env, deps.fetch, deps.now());
  // I-02: avisos nuevos que esperan en el buzón pasan a la cola de webhooks
  await drainOutbox(env, getDb(env.DB), deps.now());
}

async function maintenanceCron(env: Bindings, deps: JobDeps): Promise<void> {
  await new SystemDb(getDb(env.DB)).purgeExpiredAuth(deps.now());
  // P-03: las cuentas diarias de pantallas viejas se borran; los pasos del embudo quedan
  await getDb(env.DB).run(sql`DELETE FROM events_daily WHERE day < ${localDate(deps.now() - LIMITS.events.retentionMs)}`);
  await purgeApiRate(getDb(env.DB), deps.now());
  // P-06: pasa a R2 una tanda de datos viejos (solo si ARCHIVE_AFTER_MONTHS está configurada)
  await archiveOld(env, getDb(env.DB), deps.now());
  await recordUsage(env, deps.now());
}

const CRON_HANDLERS = new Map<string, (env: Bindings, deps: JobDeps) => Promise<void>>([
  [CRONS.forecast, enqueueForecasts],
  [CRONS.drought, enqueueAll("drought", "pest", "senacsa")],
  [CRONS.weeklyReports, enqueueAll("weekly_report", "benchmark")],
  [CRONS.notify, notifyCron],
  [CRONS.maintenance, maintenanceCron],
]);

export async function scheduled(controller: { cron: string }, env: Bindings, deps = defaultDeps()): Promise<void> {
  await CRON_HANDLERS.get(controller.cron)?.(env, deps);
}

type FarmJob = Exclude<JobMessage, { type: "webhook" }>;
type JobHandlers = {
  [K in FarmJob["type"]]: (env: Bindings, deps: JobDeps, farm: Farm, msg: Extract<FarmJob, { type: K }>) => Promise<unknown>;
};

const JOB_HANDLER_TABLE: JobHandlers = {
  forecast: (env, deps, farm) => forecastJob(getDb(env.DB), env, deps, farm),
  drought: (env, deps, farm) => droughtJob(getDb(env.DB), deps, farm),
  weekly_report: (env, deps, farm) => weeklyReportJob(getDb(env.DB), env, deps, farm),
  pest: (env, deps, farm) => pestJob(getDb(env.DB), deps, farm),
  senacsa: (env, deps, farm) => senacsaJob(getDb(env.DB), deps, farm),
  benchmark: (env, deps, farm) => benchmarkJob(new SystemDb(getDb(env.DB)), farm, deps.now()),
  plot_forecast: (env, deps, farm, msg) => plotForecastJob(getDb(env.DB), env, deps, farm, msg.plotId),
};

const JOB_HANDLERS = new Map(
  Object.entries(JOB_HANDLER_TABLE) as [FarmJob["type"], (env: Bindings, deps: JobDeps, farm: Farm, msg: FarmJob) => Promise<unknown>][],
);

export async function runJob(msg: FarmJob, env: Bindings, deps = defaultDeps()): Promise<void> {
  const [farm] = await getDb(env.DB)
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
  await JOB_HANDLERS.get(msg.type)!(env, deps, farm, msg);
}

export async function queue(batch: MessageBatch<JobMessage>, env: Bindings): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body;
    try {
      if (body.type === "webhook") await deliverWebhook(env, getDb(env.DB), body);
      else await runJob(body, env);
      msg.ack();
    } catch (err) {
      console.error("[job]", body.type, body.type === "webhook" ? `endpoint=${body.endpointId}` : `farm=${body.farmId}`, err);
      // I-02: los webhooks reintentan con espera creciente (30 s, 5 min, 30 min); el resto, a los 10 minutos
      msg.retry({ delaySeconds: body.type === "webhook" ? webhookRetryDelay(msg.attempts) : 600 });
    }
  }
}
