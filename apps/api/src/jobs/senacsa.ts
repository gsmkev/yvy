/**
 * Recordatorios de las campañas oficiales de SENACSA (ADR 0005, sección 2). Corre dentro del cron diario de la
 * sequía, un mensaje por estancia. Presupuesto: nada de consultas fuera de las fechas de aviso; dentro, 2 consultas
 * y un upsertAlert por aviso (el aviso no se repite: la clave es estancia + período + tipo).
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  localDate,
  officialCampaigns,
  senacsaReminders,
  senacsaReminderWindow,
  SENACSA_SOURCE,
  SANITARY_EARLY_DAYS,
  type SenacsaCampaign,
  type SenacsaReminder,
} from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB } from "../db/client";
import { upsertAlert } from "./alerts";
import type { AlertDraft } from "./rules";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const names = (cs: readonly SenacsaCampaign[]) =>
  cs.map((c) => (c.reason === "aftosa" ? "aftosa" : "brucelosis de terneras")).join(" y ");

/** Texto y severidad de un recordatorio (es-PY con voseo). */
export function senacsaDraft(farm: { id: string }, r: SenacsaReminder): AlertDraft {
  const from = r.campaigns.reduce((m, c) => (c.from < m ? c.from : m), r.campaigns[0]!.from);
  const to = r.campaigns.reduce((m, c) => (c.to > m ? c.to : m), r.campaigns[0]!.to);
  const what = names(r.campaigns);
  const summary =
    r.type === "before"
      ? `Campaña oficial de SENACSA: vacunación contra ${what}, abre el ${dm(from)} y cierra el ${dm(to)}. Andá preparando la hacienda.`
      : r.type === "open"
        ? `Abrió la campaña oficial de SENACSA: vacunación contra ${what}, hasta el ${dm(to)}.`
        : `Cierra el ${dm(to)} la vacunación oficial contra ${what} y todavía no la registraste.`;
  return {
    kind: "senacsa",
    severity: r.type === "closing" ? "warning" : r.type === "open" ? "watch" : "info",
    probability: null,
    validFrom: r.validFrom,
    validTo: r.validTo,
    summary,
    dedupeKey: `${farm.id}:senacsa:${r.key}`,
    details: { plotIds: [], source: SENACSA_SOURCE, type: r.type, campaigns: r.campaigns.map((c) => c.id), from, to },
  };
}

export async function senacsaJob(
  db: DB,
  deps: { now: () => number },
  farm: { id: string; organizationId: string; tz: string },
): Promise<void> {
  const now = deps.now();
  const today = localDate(now, farm.tz);
  const campaigns = officialCampaigns(Number(today.slice(0, 4)), { hasLivestock: true });
  if (!senacsaReminderWindow(campaigns, today)) return;
  // Estancia con hacienda: algún conteo o movimiento registrado.
  const [has] = await db
    .select({ id: s.records.id })
    .from(s.records)
    .where(
      and(eq(s.records.farmId, farm.id), inArray(s.records.kind, ["herd_count", "herd_move"]), isNull(s.records.deletedAt)),
    )
    .limit(1);
  if (!has) return;
  let reminders = senacsaReminders(campaigns, today);
  if (reminders.some((r) => r.type === "closing")) {
    const since = Date.parse(`${campaigns.reduce((m, c) => (c.from < m ? c.from : m), campaigns[0]!.from)}T00:00:00-03:00`) - SANITARY_EARLY_DAYS * 86_400_000;
    const health = await db
      .select({ at: s.records.capturedAt, reason: sql<string>`json_extract(${s.records.data}, '$.reason')` })
      .from(s.records)
      .where(and(eq(s.records.farmId, farm.id), eq(s.records.kind, "health"), isNull(s.records.deletedAt), gte(s.records.capturedAt, since)))
      .limit(200);
    reminders = senacsaReminders(campaigns, today, (c) =>
      health.some((h) => h.reason === c.reason && h.at >= Date.parse(`${c.from}T00:00:00-03:00`) - SANITARY_EARLY_DAYS * 86_400_000),
    );
  }
  for (const r of reminders) await upsertAlert(db, farm, senacsaDraft(farm, r), now);
}
