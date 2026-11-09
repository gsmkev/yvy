// Carga en D1 local un pronóstico real de MET Norway procesado con la misma función del Worker.
// Uso: curl ... > met.json && npx tsx scripts/demo-forecast.ts met.json <farmId> > forecast.sql
import { readFileSync } from "node:fs";
import { dailyFromMet, type MetResponse } from "../src/jobs/weather";

const [file, farmId] = process.argv.slice(2);
const met = JSON.parse(readFileSync(file!, "utf8")) as MetResponse;
const runAt = Date.parse(met.properties.meta.updated_at);
const q = (v: number | null) => (v === null ? "NULL" : String(v));
for (const d of dailyFromMet(met, "America/Asuncion")) {
  console.log(
    `INSERT OR REPLACE INTO forecasts (farm_id, run_at, source, valid_date, tmin_c, tmax_c, precip_mm, wind_kmh, wind_dir_deg) VALUES ('${farmId}', ${runAt}, 'met_norway', '${d.date}', ${q(d.tminC)}, ${q(d.tmaxC)}, ${d.precipMm}, ${q(d.windKmh)}, ${q(d.windDirDeg)});`,
  );
}
