/** Datos de clima de prueba para los tests de agri-p2 (lotes de 10 filas por el tope de parámetros de D1). */
import * as s from "@yvy/shared/schema";
import { db } from "./helpers";

export const DAY = 86_400_000;
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type ClimateRow = Omit<typeof s.climateDaily.$inferInsert, "farmId" | "plotId">;

export async function seedClimate(farmId: string, rows: ClimateRow[]) {
  for (let i = 0; i < rows.length; i += 10)
    await db()
      .insert(s.climateDaily)
      .values(rows.slice(i, i + 10).map((r) => ({ ...r, farmId, plotId: "" })));
}

/** NASA POWER diario: `days` días desde `fromMs` con las mismas temperaturas. */
export const seedPower = (farmId: string, fromMs: number, days: number, tmin = 20, tmax = 30, soilTop?: number) =>
  seedClimate(
    farmId,
    Array.from({ length: days }, (_, i) => ({
      date: isoDay(fromMs + i * DAY),
      source: "nasa_power",
      tminC: tmin,
      tmaxC: tmax,
      soilMoisture0_7: soilTop ?? null,
    })),
  );
