/**
 * Dispara el workflow de jobs en GitHub Actions al crear una estancia (S-02, M-01).
 * Secrets opcionales: sin ellos (desarrollo local) no hace nada y el cron semanal procesa la estancia.
 */
import type { Context } from "hono";
import { getDb } from "../db/client";
import { SystemDb } from "../db/system";
import type { Bindings } from "../types";

export const DISPATCH_JOB = "new_farm";
const WORKFLOW = "jobs.yml";
const REF = "main";

let warned = false;

export function dispatchConfigured(env: Pick<Bindings, "GITHUB_DISPATCH_TOKEN" | "GITHUB_REPO">): boolean {
  return Boolean(env.GITHUB_DISPATCH_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO ?? ""));
}

/** Pide a GitHub correr `new_farm` para la estancia. Nunca lanza: marca la estancia como fallida si GitHub rechaza. */
export async function dispatchNewFarm(env: Bindings, farmId: string): Promise<"skipped" | "sent" | "failed"> {
  if (!dispatchConfigured(env)) {
    if (!warned) {
      warned = true;
      console.warn("GITHUB_DISPATCH_TOKEN/GITHUB_REPO sin configurar: no se disparan los jobs al crear estancias");
    }
    return "skipped";
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "Yvy/1.0 koeti.com.py",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ref: REF, inputs: { job: DISPATCH_JOB, farm: farmId } }),
      },
    );
    if (res.status === 204) return "sent";
    console.error(`dispatch de ${DISPATCH_JOB} rechazado: HTTP ${res.status}`);
  } catch (e) {
    console.error("dispatch de jobs falló", e);
  }
  try {
    await new SystemDb(getDb(env.DB)).setImageryStatus(farmId, "failed");
  } catch (e) {
    console.error("no se pudo marcar la estancia como fallida", e);
  }
  return "failed";
}

/** Corre `work` sin demorar la respuesta; si no hay ExecutionContext (tests) lo espera. */
export async function inBackground(c: Context, work: Promise<unknown>): Promise<void> {
  let ctx: Pick<ExecutionContext, "waitUntil"> | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  if (ctx) ctx.waitUntil(work);
  else await work;
}
