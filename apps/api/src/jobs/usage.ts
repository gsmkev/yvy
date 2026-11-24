import { eq, sql } from "drizzle-orm";
import { LIMITS, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../db/client";
import { sendEmail } from "../lib/email";
import type { Bindings } from "../types";

/** Uso diario y aviso al 70 % de los límites del plan gratis (anexo §6). */
export async function recordUsage(env: Bindings, now: number): Promise<void> {
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
