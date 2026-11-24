// Vuelca a apps/api/seed/demo-fixture.json las filas de la organización que carga seed-manual.mjs (la base local de
// wrangler dev), para que seed-demo.mjs las rearme como la demo pública. Las filas salen de la API real, así que los
// derivados (stock, costos, resultados) ya son coherentes entre sí. Las fechas quedan como estaban ese día ("d0"):
// seed-demo las corre hasta hoy.
//
// Uso (Node 22.5+ por node:sqlite):
//   node apps/api/scripts/dump-demo-fixture.mjs <base.sqlite> [email del dueño = dueno@sanpedro.test]
// La base está en <persist-to>/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite (copiala antes de leerla).
import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [dbPath, ownerEmail = "dueno@sanpedro.test"] = process.argv.slice(2);
if (!dbPath) throw new Error("Uso: dump-demo-fixture.mjs <base.sqlite> [email del dueño]");
const db = new DatabaseSync(dbPath, { readOnly: true });
const owner = db.prepare("SELECT id FROM users WHERE email = ?").get(ownerEmail);
if (!owner) throw new Error(`no hay usuario ${ownerEmail}`);
const org = db.prepare("SELECT organization_id AS o FROM memberships WHERE user_id = ? ORDER BY created_at DESC").get(owner.id).o;

const byOrg = "organization_id = :org";
const byFarm = "farm_id IN (SELECT id FROM farms WHERE organization_id = :org)";
const byUser = "user_id IN (SELECT user_id FROM memberships WHERE organization_id = :org)";
// Tablas que se vuelcan y con qué filtro. Quedan afuera a propósito: tokens de API, webhooks, enlaces de solo lectura,
// segundo factor, informes programados (mandan correos), sesiones, códigos y dispositivos.
const TABLES = {
  users: "id IN (SELECT user_id FROM memberships WHERE organization_id = :org)",
  memberships: byOrg, farms: byOrg, plots: byOrg, points_of_interest: byOrg, farm_lines: byOrg, plot_assignments: byOrg,
  seasons: byOrg, plot_seasons: byOrg, products: byOrg, product_dose_ranges: byOrg, animals: byOrg, parties: byOrg,
  machines: byOrg, contractors: byOrg, exchange_rates: byOrg, cost_entries: byOrg, warehouses: byOrg, stock_moves: byOrg,
  stock_minimums: byOrg, tasks: byOrg, records: byOrg, comments: byOrg, record_reviews: byOrg, soil_samples: byOrg,
  grain_deliveries: byOrg, yield_maps: byOrg, plot_index_stats: byOrg, problem_areas: byOrg, eudr_results: byOrg,
  plot_analyses: byOrg, management_zones: byOrg, form_configs: byOrg, alerts: byOrg, farm_alert_settings: byOrg,
  farm_livestock_settings: byOrg, sanitary_events: byOrg, farm_access: byOrg, maintenance_plans: byOrg,
  maintenance_logs: byOrg, machine_costs: byOrg, employees: byOrg, attendance: byOrg, employee_payments: byOrg,
  feed_rations: byOrg, budget_lines: byOrg, purchases: byOrg, purchase_lines: byOrg, grain_contracts: byOrg,
  grain_settlements: byOrg, cattle_deals: byOrg, cash_accounts: byOrg, cash_moves: byOrg, document_taxes: byOrg,
  export_formats: byOrg, account_map: byOrg, zone_benchmarks: byOrg,
  climate_daily: byFarm, forecasts: byFarm, forecast_hours: byFarm, plot_forecasts: byFarm, farm_risk: byFarm, farm_spi: byFarm,
  notification_prefs: byUser, alert_feedback: "alert_id IN (SELECT id FROM alerts WHERE organization_id = :org)",
  alert_plots: "alert_id IN (SELECT id FROM alerts WHERE organization_id = :org)",
  scenes: "id IN (SELECT scene_id FROM plot_index_stats WHERE organization_id = :org)",
  fire_hotspots: "1 = 1",
};
const tables = {};
let rows = 0;
for (const [t, where] of Object.entries(TABLES)) {
  tables[t] = db.prepare(`SELECT * FROM ${t} WHERE ${where.replace(/:org/g, `'${org}'`)}`).all().map((r) => ({ ...r }));
  rows += tables[t].length;
}
// d0: el día en que corrió seed-manual (el cultivo del Lote 5 se sembró 59 días antes).
const l5 = tables.plots.find((p) => p.name === "Lote 5 Girasol");
const d0 = new Date(Date.parse(`${l5.sowing_date}T12:00:00Z`) + 59 * 86_400_000).toISOString().slice(0, 10);
const file = fileURLToPath(new URL("../seed/demo-fixture.json", import.meta.url));
const lines = Object.entries(tables).map(([t, rs]) => `${JSON.stringify(t)}:[\n${rs.map((r) => JSON.stringify(r)).join(",\n")}\n]`);
writeFileSync(file, `{"d0":${JSON.stringify(d0)},"tables":{\n${lines.join(",\n")}\n}}\n`);
console.log(`d0=${d0} filas=${rows} -> ${file}`);
