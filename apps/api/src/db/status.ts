/**
 * P-04: estado público del servicio. Sin datos de clientes: solo si el Worker, D1 y R2 responden y cuándo fue la última
 * corrida de cada job de datos. /ingest anota cada pedido firmado de los jobs de GitHub Actions (job_runs); el estado de
 * cada job sale de esas anotaciones y de lo que se espera de él (LIMITS.status).
 */
import { sql } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { Bindings } from "../types";
import type { DB } from "./client";

export const STATUS_JOBS = ["sentinel2", "chirps", "firms"] as const;
export type StatusJob = (typeof STATUS_JOBS)[number];

/** Qué job de datos hace cada ruta de /ingest (las que no están acá no cuentan como corrida de un job). */
export function jobOfIngestPath(path: string): StatusJob | null {
  const p = path.replace(/^\/ingest/, "");
  if (/^\/(scenes|plot-index-stats)(\/|$)/.test(p) || /^\/farms\/[^/]+\/(imagery|history)-status$/.test(p)) return "sentinel2";
  if (/^\/(climate-daily|climatology|farm-spi)$/.test(p)) return "chirps";
  if (p === "/fire-alerts") return "firms";
  return null;
}

/** Anota un pedido ya autenticado de /ingest. Escribe como mucho una vez por minuto y job, salvo que cambie el estado (falla → éxito o al revés). */
export async function recordIngest(db: DB, path: string, httpStatus: number, now = Date.now()): Promise<void> {
  const job = jobOfIngestPath(path);
  if (!job) return;
  const ok = httpStatus < 400;
  const gap = LIMITS.status.recordEveryMs;
  if (ok)
    await db.run(sql`INSERT INTO job_runs (job, last_ok_at) VALUES (${job}, ${now})
      ON CONFLICT(job) DO UPDATE SET last_ok_at = excluded.last_ok_at
      WHERE job_runs.last_ok_at IS NULL OR job_runs.last_ok_at < excluded.last_ok_at - ${gap}
        OR COALESCE(job_runs.last_fail_at, 0) > job_runs.last_ok_at`);
  else
    await db.run(sql`INSERT INTO job_runs (job, last_fail_at, last_fail_status) VALUES (${job}, ${now}, ${httpStatus})
      ON CONFLICT(job) DO UPDATE SET last_fail_at = excluded.last_fail_at, last_fail_status = excluded.last_fail_status
      WHERE job_runs.last_fail_at IS NULL OR job_runs.last_fail_at < excluded.last_fail_at - ${gap}
        OR COALESCE(job_runs.last_ok_at, 0) > job_runs.last_fail_at`);
}

export type JobState = "ok" | "late" | "failing" | "none";

export function jobState(
  job: StatusJob,
  r: { lastOkAt: number | null; lastFailAt: number | null } | undefined,
  now: number,
): JobState {
  if (!r || (r.lastOkAt === null && r.lastFailAt === null)) return "none";
  // Falló después de su último éxito
  if (r.lastFailAt !== null && (r.lastOkAt === null || r.lastFailAt > r.lastOkAt)) return "failing";
  return now - (r.lastOkAt ?? 0) > LIMITS.status.staleAfterHours[job] * 3_600_000 ? "late" : "ok";
}

interface Probe {
  ok: boolean;
  ms: number;
}

async function probe(fn: () => Promise<unknown>): Promise<Probe> {
  const t0 = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), LIMITS.status.probeTimeoutMs))]);
    return { ok: true, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

export async function serviceStatus(env: Pick<Bindings, "DB" | "MEDIA">, db: DB, now = Date.now()) {
  const [d1, r2] = await Promise.all([
    probe(() => env.DB.prepare("SELECT 1").first()),
    probe(() => env.MEDIA.list({ limit: 1 })),
  ]);
  let rows: (typeof s.jobRuns.$inferSelect)[] = [];
  if (d1.ok) rows = await db.select().from(s.jobRuns).limit(STATUS_JOBS.length * 2);
  const jobs = STATUS_JOBS.map((id) => {
    const r = rows.find((x) => x.job === id);
    return { id, state: jobState(id, r, now), lastOkAt: r?.lastOkAt ?? null, lastFailAt: r?.lastFailAt ?? null };
  });
  const core = [d1.ok, r2.ok];
  const overall = !d1.ok ? "down" : core.every(Boolean) && jobs.every((j) => j.state !== "failing") ? "ok" : "degraded";
  return {
    checkedAt: now,
    overall,
    services: [
      { id: "worker" as const, ok: true },
      { id: "d1" as const, ok: d1.ok },
      { id: "r2" as const, ok: r2.ok },
    ],
    jobs,
  };
}
