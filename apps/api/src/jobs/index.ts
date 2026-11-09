/**
 * Crons y cola (PRD-cloudflare §4.8). Cada mensaje = una estancia, para quedar bajo los 10 ms de CPU.
 * Fases 5-7 completan los consumidores; por ahora encolan y registran.
 */
import { getDb } from "../db/client";
import { SystemDb } from "../db/system";
import type { Bindings, JobMessage } from "../types";

export const CRONS = {
  forecast: "0 */3 * * *",
  drought: "0 11 * * *",
  notify: "*/15 * * * *",
  weeklyReports: "0 10 * * 1",
  maintenance: "0 3 * * *",
} as const;

async function enqueuePerFarm(env: Bindings, type: JobMessage["type"]): Promise<number> {
  const farms = await new SystemDb(getDb(env.DB)).activeFarms();
  for (let i = 0; i < farms.length; i += 100) {
    await env.JOBS.sendBatch(
      farms.slice(i, i + 100).map((f) => ({ body: { type, farmId: f.id } satisfies JobMessage })),
    );
  }
  return farms.length;
}

export async function scheduled(controller: ScheduledController, env: Bindings): Promise<void> {
  switch (controller.cron) {
    case CRONS.forecast:
      await enqueuePerFarm(env, "forecast");
      return;
    case CRONS.drought:
      await enqueuePerFarm(env, "drought");
      return;
    case CRONS.weeklyReports:
      await enqueuePerFarm(env, "weekly_report");
      return;
    case CRONS.notify:
      // Fase 6: enviar notificaciones pendientes (Expo Push + Resend).
      return;
    case CRONS.maintenance:
      await new SystemDb(getDb(env.DB)).purgeExpiredAuth();
      return;
  }
}

export async function queue(batch: MessageBatch<JobMessage>, _env: Bindings): Promise<void> {
  for (const msg of batch.messages) {
    switch (msg.body.type) {
      case "forecast": // Fase 5: MET Norway Locationforecast 2.0 + reglas de helada y exceso de lluvia
      case "drought": // Fase 5/6: NASA POWER + regla de sequía
      case "weekly_report": // Fase 7: Browser Rendering
        console.log(`[job] ${msg.body.type} farm=${msg.body.farmId} (pendiente)`);
        break;
    }
    msg.ack();
  }
}
