/**
 * Job de sequía: baja NASA POWER, cruza la lluvia CHIRPS con la climatología y genera el aviso.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { addDays, localDate } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { DB } from "../db/client";
import { dayOfYear } from "../db/queries";
import { SystemDb } from "../db/system";
import { upsertAlert } from "./alerts";
import type { Farm, JobDeps } from "./farm";
import { recentRuns } from "./forecast";
import { evaluateDrought } from "./rules";
import { dailyFromPower, powerUrl } from "./weather";

/** NASA POWER (temperatura y humedad del suelo) → sequía, cruzando CHIRPS y climatología. */
export async function droughtJob(db: DB, deps: JobDeps, farm: Farm): Promise<void> {
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

