// Genera apps/api/seed/demo.sql: la organización de ejemplo (plan 'demo', solo lectura) para producción.
// Uso: pnpm --filter api seed:demo   (corre con tsx para importar @yvy/shared y @yvy/geo)
//
// - Ids fijos y INSERT OR IGNORE en todo: correr el SQL dos veces no duplica ni pisa nada.
// - Las fechas son relativas al día en que se corre el script (últimos 60 días), así que se ve vigente.
//   Para refrescarla más adelante, borrá las filas de la organización demo y volvé a cargar demo.sql.
// - Cada `data` de los registros se valida con parseRecordData: si algo no valida, el script falla.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { areaHa, bboxOf, centroidOf, containsPoint } from "@yvy/geo";
import { parseRecordData, prescriptionSchema, RECORD_SCHEMA_VERSION } from "@yvy/shared";

// ---------- utilidades ----------

const DAY = 86_400_000;
const NOW = Date.now();
const TZ_OFFSET = "-03:00"; // America/Asuncion (UTC-3 todo el año desde 2024)

const ymdLocal = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const TODAY = ymdLocal(NOW);
const localMs = (ymd, hour = 0, min = 0) =>
  Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00${TZ_OFFSET}`);
const dayStr = (daysAgo) => ymdLocal(NOW - daysAgo * DAY);
const at = (daysAgo, hour, min = 0) => localMs(dayStr(daysAgo), hour, min);

/** Ids tipo UUIDv7 fijos: 0190d000-<categoría>-7000-8000-<n>. */
const CAT = {
  org: 1, user: 2, membership: 3, farm: 4, plot: 5, poi: 6, assignment: 7, season: 8, plotSeason: 9,
  product: 10, task: 11, record: 12, alert: 13,
};
const id = (cat, n) => `0190d000-${CAT[cat].toString(16).padStart(4, "0")}-7000-8000-${n.toString(16).padStart(12, "0")}`;

let seed = 20260101;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rnd() * (b - a);
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const sql = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`número inválido: ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
};
const out = [];
const insert = (table, row) => {
  const cols = Object.keys(row);
  out.push(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => sql(row[c])).join(", ")});`);
};
const counts = {};
const count = (t) => (counts[t] = (counts[t] ?? 0) + 1);
const ins = (table, row) => {
  insert(table, row);
  count(table);
};

// ---------- organización y personas ----------

const ORG_ID = id("org", 1);
const OWNER_ID = id("user", 1);
const T0 = NOW - 90 * DAY; // la organización "existe" desde hace 90 días
const ts = { created_at: T0, updated_at: T0 };

out.push("-- Organización de ejemplo (demo de solo lectura). Generado por scripts/seed-demo.mjs; no editar a mano.");
out.push(`-- Generado el ${TODAY}. Ids fijos e INSERT OR IGNORE: se puede cargar más de una vez.`);

ins("organizations", {
  id: ORG_ID, name: "Estancia de ejemplo", country: "PY", plan: "demo", trial_ends_at: null,
  created_at: T0, updated_at: T0,
});

const people = {
  owner: { n: 1, email: "demo@yvy.invalid", name: "Equipo Yvy", role: "owner" },
  ana: { n: 2, email: "ana.villalba@yvy.invalid", name: "Ing. Ana Villalba", role: "agronomist" },
  ramon: { n: 3, email: null, name: "Ramón Benítez", role: "worker" },
  lidia: { n: 4, email: null, name: "Lidia Ortiz", role: "worker" },
  celso: { n: 5, email: null, name: "Celso Gamarra", role: "worker" },
};
for (const p of Object.values(people)) {
  p.id = id("user", p.n);
  ins("users", { id: p.id, email: p.email, full_name: p.name, phone: null, locale: "es-PY", ...ts });
  ins("memberships", {
    id: id("membership", p.n), organization_id: ORG_ID, user_id: p.id, role: p.role, status: "active",
    assignments_version: p.role === "worker" ? 1 : 0, ...ts,
  });
}

// ---------- estancia, lotes, puntos ----------

const synced = { created_at: T0, updated_at: T0, deleted_at: null, version: 1 };
const FARM_ID = id("farm", 1);
const rect = (w, s, e, n) => ({
  type: "Polygon",
  coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]].map(([x, y]) => [round(x, 6), round(y, 6)])],
});
const bboxCols = (g) => {
  const b = bboxOf(g);
  return { min_lon: b.minLon, min_lat: b.minLat, max_lon: b.maxLon, max_lat: b.maxLat };
};

const farmGeom = rect(-55.95, -27.21, -55.89, -27.15);
const farmCentroid = centroidOf(farmGeom);
ins("farms", {
  id: FARM_ID, organization_id: ORG_ID, name: "Estancia San Pedro", department: "Itapúa", district: "Hohenau",
  geometry: JSON.stringify(farmGeom), ...bboxCols(farmGeom),
  centroid_lon: round(farmCentroid.lon, 6), centroid_lat: round(farmCentroid.lat, 6),
  area_ha: round(areaHa(farmGeom), 2), timezone: "America/Asuncion", offline_pack_version: 0, ...synced,
});

// Grilla 3 x 3 de celdas de 0.02 x 0.02 grados con 0.001 de calle entre lotes.
const COL = [-55.95, -55.93, -55.91, -55.89];
const ROW = [-27.15, -27.17, -27.19, -27.21]; // de norte a sur
const GAP = 0.001;
const cell = (c, r, rowSpan = 1, halfRow = 0) => {
  const north = ROW[r] - GAP;
  const south = ROW[r + rowSpan] + GAP;
  if (!halfRow) return rect(COL[c] + GAP, south, COL[c + 1] - GAP, north);
  const mid = (ROW[r] + ROW[r + 1]) / 2;
  return halfRow === 1
    ? rect(COL[c] + GAP, mid + GAP / 2, COL[c + 1] - GAP, north)
    : rect(COL[c] + GAP, south, COL[c + 1] - GAP, mid - GAP / 2);
};
// Lote 6 en L: la celda (2,1) más la mitad izquierda de la celda (2,2).
const lShape = () => {
  const w = COL[2] + GAP, e = COL[3] - GAP, mid = (COL[2] + COL[3]) / 2;
  const n = ROW[1] - GAP, s = ROW[3] + GAP;
  return {
    type: "Polygon",
    coordinates: [[[w, n], [e, n], [e, ROW[2]], [mid, ROW[2]], [mid, s], [w, s], [w, n]].map(([x, y]) => [round(x, 6), round(y, 6)])],
  };
};

const sown = (daysAgo) => dayStr(daysAgo);
const plotDefs = {
  l1: { n: 1, name: "Lote 1 Norte", kind: "crop", crop: "soja", season: "zafra", sow: 48, geom: cell(0, 0), color: "#7A9A3F", worker: "ramon" },
  l2: { n: 2, name: "Lote 2 Maíz", kind: "crop", crop: "maiz", season: "zafra", sow: 58, geom: cell(1, 0), color: "#D9A93A", worker: "ramon" },
  l3: { n: 3, name: "Lote 3 Trigo", kind: "crop", crop: "trigo", season: null, sow: 165, geom: cell(2, 0), color: "#C9C46A", worker: "lidia" },
  l4: { n: 4, name: "Lote 4 Soja", kind: "crop", crop: "soja", season: "zafra", sow: 42, geom: cell(0, 1), color: "#7A9A3F", worker: "ramon" },
  l5: { n: 5, name: "Lote 5 Girasol", kind: "crop", crop: "girasol", season: "zafra", sow: 59, geom: cell(1, 1), color: "#D9A93A", worker: "lidia" },
  l6: { n: 6, name: "Lote 6 en L", kind: "crop", crop: "soja", season: "zafra", sow: 38, geom: lShape(), color: "#3F6B35", worker: "lidia" },
  l7: { n: 7, name: "Lote 7 Maíz zafrinha", kind: "crop", crop: "maiz", season: "zafrina", sow: 55, geom: cell(0, 2), color: "#D9A93A", worker: "lidia" },
  p1: { n: 8, name: "Potrero Aguada", kind: "pasture", pastureType: "Brachiaria", geom: cell(1, 2, 1, 1), color: "#8DB3C7", worker: "celso" },
  p2: { n: 9, name: "Potrero Monte", kind: "pasture", pastureType: "Panicum", geom: cell(1, 2, 1, 2), color: "#8DB3C7", worker: "celso" },
};
for (const [key, p] of Object.entries(plotDefs)) {
  p.key = key;
  p.id = id("plot", p.n);
  p.areaHa = round(areaHa(p.geom), 2);
  ins("plots", {
    id: p.id, organization_id: ORG_ID, farm_id: FARM_ID, name: p.name, kind: p.kind,
    geometry: JSON.stringify(p.geom), ...bboxCols(p.geom), area_ha: p.areaHa,
    crop: p.crop ?? null, season: p.season ?? null, sowing_date: p.sow ? sown(p.sow) : null,
    pasture_type: p.pastureType ?? null, color: p.color, ...synced,
  });
}
const plots = plotDefs;
const cropPlots = Object.values(plots).filter((p) => p.kind === "crop");

/** Punto al azar dentro de un lote, lejos del borde. */
const pointIn = (p) => {
  const b = bboxOf(p.geom);
  for (let i = 0; i < 500; i++) {
    const lon = round(between(b.minLon, b.maxLon), 6);
    const lat = round(between(b.minLat, b.maxLat), 6);
    if (containsPoint(p.geom, lon, lat)) return { lon, lat };
  }
  throw new Error(`sin punto dentro de ${p.name}`);
};
const centerOf = (p) => {
  const c = centroidOf(p.geom);
  const lon = round(c.lon, 6), lat = round(c.lat, 6);
  if (!containsPoint(p.geom, lon, lat)) throw new Error(`el centroide de ${p.name} queda afuera`);
  return { lon, lat };
};

// Puntos de interés
const poiDefs = {
  rain: { n: 1, kind: "rain_gauge", name: "Pluviómetro del Lote 2", ...centerOf(plots.l2), plot: "l2" },
  water: { n: 2, kind: "water", name: "Aguada del Potrero Aguada", ...centerOf(plots.p1), plot: "p1" },
  trough: { n: 3, kind: "trough", name: "Bebedero del Potrero Monte", ...centerOf(plots.p2), plot: "p2" },
  house: { n: 4, kind: "house", name: "Casa principal", lon: -55.93, lat: -27.2 },
  corral: { n: 5, kind: "corral", name: "Corral de encierro", lon: -55.93, lat: -27.2045 },
  chute: { n: 6, kind: "chute", name: "Manga", lon: -55.93, lat: -27.2065 },
  gate: { n: 7, kind: "gate", name: "Tranquera de entrada", lon: -55.92, lat: -27.1503 },
};
for (const p of Object.values(poiDefs)) {
  p.id = id("poi", p.n);
  ins("points_of_interest", {
    id: p.id, organization_id: ORG_ID, farm_id: FARM_ID, kind: p.kind, name: p.name, lon: p.lon, lat: p.lat, ...synced,
  });
}

// Asignaciones de lotes a empleados
let an = 0;
for (const p of Object.values(plots)) {
  ins("plot_assignments", {
    id: id("assignment", ++an), organization_id: ORG_ID, plot_id: p.id, user_id: people[p.worker].id, ...synced,
  });
}

// ---------- campaña y productos ----------

const SEASON_ID = id("season", 1);
ins("seasons", {
  id: SEASON_ID, organization_id: ORG_ID, name: "Zafra 2026/27", start_date: "2026-09-01", end_date: "2027-06-30",
  active: true, ...synced,
});
const planning = {
  l1: ["TMG 7062 IPRO", 3.6], l2: ["Pioneer P3707", 9.5], l3: ["Biointa 1005", 3.2], l4: ["Nidera 5909", 3.5],
  l5: ["Paraíso 33", 2.4], l6: ["Brasmax Desafio", 3.7], l7: ["DKB 390", 7.8],
};
let psn = 0;
for (const [key, [variety, target]] of Object.entries(planning)) {
  const p = plots[key];
  ins("plot_seasons", {
    id: id("plotSeason", ++psn), organization_id: ORG_ID, plot_id: p.id, season_id: SEASON_ID, crop: p.crop,
    variety, planned_sowing_date: sown(p.sow), target_yield_t_ha: target, ...synced,
  });
}

const prodDefs = {
  glifo: { n: 1, name: "Glifosato 48 %", type: "agrochemical", unit: "l", activeIngredient: "Glifosato", withdrawalDays: 14, toxClass: "IV" },
  lambda: { n: 2, name: "Engeo Pleno", type: "agrochemical", unit: "l", activeIngredient: "Lambda-cialotrina + Tiametoxam", withdrawalDays: 21, toxClass: "II" },
  urea: { n: 3, name: "Urea 46", type: "fertilizer", unit: "kg", activeIngredient: "Nitrógeno 46 %", withdrawalDays: null, toxClass: null },
  semilla: { n: 4, name: "Semilla de soja", type: "seed", unit: "kg", activeIngredient: null, withdrawalDays: null, toxClass: null },
};
for (const p of Object.values(prodDefs)) {
  p.id = id("product", p.n);
  ins("products", {
    id: p.id, organization_id: ORG_ID, name: p.name, type: p.type, unit: p.unit,
    active_ingredient: p.activeIngredient, withdrawal_days: p.withdrawalDays, tox_class: p.toxClass, ...synced,
  });
}

// ---------- registros ----------

const recordDefs = []; // { key, kind, plot, author, daysAgo, hour, data, poi }
const rec = (key, kind, plotKey, authorKey, daysAgo, hour, data, extra = {}) =>
  recordDefs.push({ key, kind, plotKey, authorKey, daysAgo, hour, minute: Math.floor(rnd() * 60), data, ...extra });
const worker = (k) => plots[k].worker;

// Lluvia: ~11 días en 60, leídos a las 7 h en el pluviómetro del Lote 2.
const rainDays = [[2, 12], [5, 4], [6, 31], [10, 18], [15, 7], [16, 46], [22, 9], [28, 23], [35, 14], [41, 38], [47, 6], [53, 21]];
for (const [d, mm] of rainDays) {
  const w = d % 2 === 0 ? "ramon" : "lidia";
  const hour = 7;
  rec(`rain-${d}`, "rain", "l2", w, d, hour, { mm, readAt: at(d, 7, 5) }, { poi: "rain" });
}

// Siembras (solo las que caen dentro de los 60 días) y una fertilización
for (const key of ["l1", "l2", "l4", "l5", "l6", "l7"]) {
  const p = plots[key];
  const density = p.crop === "soja" ? { density: 14, densityUnit: "seeds_m" } : p.crop === "girasol" ? { density: 4, densityUnit: "kg_ha" } : { density: 3.2, densityUnit: "seeds_m" };
  rec(`sowing-${key}`, "sowing", key, worker(key), p.sow, 8, {
    seasonId: SEASON_ID, crop: p.crop, variety: planning[key][0], ...density, areaHa: p.areaHa,
  });
}
rec("fert-l2", "fertilization", "l2", "ramon", 30, 9, {
  seasonId: SEASON_ID,
  products: [{ productId: prodDefs.urea.id, name: prodDefs.urea.name, dose: 120, unit: "kg_ha" }],
  method: "broadcast", areaHa: plots.l2.areaHa, note: "Cobertura al voleo antes de la lluvia.",
});
rec("fert-l7", "fertilization", "l7", "lidia", 25, 9, {
  seasonId: SEASON_ID,
  products: [{ productId: prodDefs.urea.id, name: prodDefs.urea.name, dose: 100, unit: "kg_ha" }],
  method: "banded", areaHa: plots.l7.areaHa,
});

// Aplicaciones
rec("app-l1-herb", "application", "l1", "ramon", 30, 7, {
  seasonId: SEASON_ID,
  products: [{ productId: prodDefs.glifo.id, name: prodDefs.glifo.name, dose: 2.5, unit: "l_ha" }],
  volumeLHa: 80, areaHa: plots.l1.areaHa, windKmh: 9, tempC: 24, humidityPct: 68, machine: "Pulverizadora autopropulsada",
});
rec("app-l4-herb", "application", "l4", "ramon", 24, 7, {
  seasonId: SEASON_ID,
  products: [{ productId: prodDefs.glifo.id, name: prodDefs.glifo.name, dose: 2.5, unit: "l_ha" }],
  volumeLHa: 80, areaHa: plots.l4.areaHa, windKmh: 7, tempC: 22, humidityPct: 72, machine: "Pulverizadora autopropulsada",
});
rec("app-l6-herb", "application", "l6", "lidia", 20, 8, {
  seasonId: SEASON_ID,
  products: [{ productId: prodDefs.glifo.id, name: prodDefs.glifo.name, dose: 2, unit: "l_ha" }],
  volumeLHa: 80, areaHa: plots.l6.areaHa, windKmh: 11, tempC: 26, humidityPct: 61,
});
rec("app-l6-chinche", "application", "l6", "lidia", 4, 8, {
  seasonId: SEASON_ID,
  products: [{ productId: prodDefs.lambda.id, name: prodDefs.lambda.name, dose: 0.2, unit: "l_ha" }],
  volumeLHa: 70, areaHa: plots.l6.areaHa, windKmh: 8, tempC: 25, humidityPct: 65, note: "Foco de chinche en el borde norte.",
});

// Cosecha de trigo
rec("harvest-l3", "harvest", "l3", "lidia", 5, 10, {
  seasonId: SEASON_ID, tons: round(plots.l3.areaHa * 3.1, 1), moisturePct: 13.2, areaHa: plots.l3.areaHa, destination: "acopio",
  note: "Cosecha terminada, rinde por encima del objetivo.",
});

// Monitoreo: chinche en soja con tendencia creciente
const chinche = {
  l1: [[26, 0.4, "low", "ana"], [18, 0.8, "low", "ramon"], [11, 1.6, "medium", "ana"], [6, 2.4, "medium", "ramon"], [2, 3.1, "high", "ana"]],
  l4: [[22, 0.2, "low", "ramon"], [14, 0.6, "low", "ramon"], [7, 1.1, "medium", "ana"], [3, 1.4, "medium", "ramon"]],
  l6: [[15, 0.5, "low", "lidia"], [9, 1.2, "medium", "lidia"], [5, 3.4, "high", "ana"], [1, 0.3, "low", "lidia"]],
};
for (const [key, list] of Object.entries(chinche))
  for (const [d, perMeter, intensity, a] of list)
    rec(`pest-${key}-${d}`, "pest", key, a, d, 9 + (d % 5), {
      pest: "chinche", intensity, perMeter, crop: "soja",
      note: intensity === "high" ? "Supera el umbral; se programa aplicación." : undefined,
    });
rec("pest-l2-oruga", "pest", "l2", "ramon", 12, 10, { pest: "oruga", intensity: "low", crop: "maiz", note: "Spodoptera en hojas bajas." });
rec("pest-l7-malezas", "pest", "l7", "lidia", 18, 11, { pest: "malezas", intensity: "medium", crop: "maiz" });
rec("pest-l3-roya", "pest", "l3", "ana", 40, 10, { pest: "roya", intensity: "low", crop: "trigo", note: "Pústulas aisladas en hoja bandera." });

// Estado del cultivo
const stageAt = {
  l1: [[30, "vegetativo", "good"], [8, "vegetativo", "good"]],
  l2: [[45, "vegetativo", "good"], [20, "floracion", "good"], [3, "floracion", "fair"]],
  l3: [[50, "llenado", "good"], [20, "madurez", "good"]],
  l4: [[25, "emergencia", "good"], [7, "vegetativo", "fair"]],
  l5: [[40, "vegetativo", "good"], [10, "floracion", "good"]],
  l6: [[28, "emergencia", "good"], [9, "vegetativo", "good"], [2, "vegetativo", "fair"]],
  l7: [[35, "emergencia", "good"], [12, "vegetativo", "good"]],
};
for (const [key, list] of Object.entries(stageAt))
  for (const [d, stage, cond] of list)
    rec(`crop-${key}-${d}`, "crop_status", key, worker(key), d, 14, { stage, condition: cond });

// Recorridas (scouting)
const scouts = [
  ["l1", "ramon", 33, "good", "Buena emergencia y uniforme."],
  ["l2", "ramon", 27, "good", "Parejo, sin manchones."],
  ["l4", "ramon", 13, "fair", "Manchón con menos plantas cerca del alambrado."],
  ["l5", "lidia", 21, "good", "Capítulos bien formados."],
  ["l6", "lidia", 7, "fair", "Hojas con daño de insectos en la cabecera norte."],
  ["l7", "lidia", 16, "good", undefined],
  ["l3", "lidia", 9, "good", "Granos llenos, casi lista para cosecha."],
  ["l2", "ana", 1, "good", "Recorrida de rutina con el agrónomo."],
];
for (const [key, a, d, cond, note] of scouts) rec(`scout-${key}-${d}`, "scouting", key, a, d, 15, { condition: cond, note });

// Potreros y hacienda
for (const [d, h, cover, present] of [[50, 22, "medium", true], [30, 18, "medium", true], [12, 9, "low", true]])
  rec(`pasture-p1-${d}`, "pasture_status", "p1", "celso", d, 8, { heightCm: h, cover, livestockPresent: present });
for (const [d, h, cover, present] of [[46, 41, "high", false], [20, 36, "high", false], [6, 28, "high", true]])
  rec(`pasture-p2-${d}`, "pasture_status", "p2", "celso", d, 8, { heightCm: h, cover, livestockPresent: present });

for (const [d, lvl] of [[44, "full"], [32, "full"], [19, "half"], [9, "half"], [2, "low"]])
  rec(`water-p1-${d}`, "water", "p1", "celso", d, 7, { level: lvl, note: lvl === "low" ? "Hay que revisar el molino." : undefined }, { poi: "water" });
for (const [d, lvl] of [[38, "full"], [14, "full"], [3, "full"]])
  rec(`water-p2-${d}`, "water", "p2", "celso", d, 7, { level: lvl }, { poi: "trough" });

const herd1 = { vaca: 62, vaquilla: 18, ternero: 41, toro: 3 };
rec("herd-p1-55", "herd_count", "p1", "celso", 55, 9, { counts: herd1 });
rec("herd-p1-30", "herd_count", "p1", "celso", 30, 9, { counts: { vaca: 62, vaquilla: 18, ternero: 44, toro: 3 }, note: "Nacieron tres terneros." });
rec("health-p1-40", "health", "p1", "celso", 40, 8, {
  reason: "desparasitacion", product: "Ivermectina 1 %", dose: "1 ml cada 50 kg", counts: herd1,
});
rec("health-p1-25", "health", "p1", "celso", 25, 8, { reason: "aftosa", product: "Vacuna antiaftosa", dose: "2 ml", counts: { vaca: 62, vaquilla: 18, ternero: 44, toro: 3 } });
rec("move-p1-p2-20", "herd_move", "p1", "celso", 20, 10, {
  toPlotId: plots.p2.id, counts: { vaca: 62, vaquilla: 18, ternero: 44, toro: 3 }, reason: "rotacion", note: "Rotación al Potrero Monte.",
});
rec("herd-p2-6", "herd_count", "p2", "celso", 6, 9, { counts: { vaca: 62, vaquilla: 18, ternero: 44, toro: 3 } });
rec("mort-p2-11", "mortality", "p2", "celso", 11, 17, { category: "ternero", head: 1, cause: "desconocida", note: "Encontrado por la mañana." });
rec("note-1", "note", "l1", "ana", 3, 16, { text: "Programar aplicación de insecticida en Lote 1 y Lote 6 si el conteo sigue arriba del umbral." });

// Validar todo y emitir
let recN = 0;
const recIds = {};
const recRows = [];
for (const r of recordDefs) {
  const plot = plots[r.plotKey];
  const parsed = parseRecordData(r.kind, r.data);
  if (!parsed.success) {
    throw new Error(`registro ${r.key} (${r.kind}) no valida: ${JSON.stringify(parsed.error.issues)}`);
  }
  const pt = r.poi ? poiDefs[r.poi] : pointIn(plot);
  const capturedAt = at(r.daysAgo, r.hour, r.minute);
  if (capturedAt > NOW) throw new Error(`registro ${r.key} en el futuro`);
  recIds[r.key] = id("record", ++recN);
  recRows.push({
    id: recIds[r.key], organization_id: ORG_ID, farm_id: FARM_ID, plot_id: plot.id, poi_id: r.poi ? poiDefs[r.poi].id : null,
    author_id: people[r.authorKey].id, kind: r.kind,
    data: JSON.stringify(parsed.data), // la forma ya normalizada (incluye deltaT en aplicaciones)
    schema_version: RECORD_SCHEMA_VERSION, lon: pt.lon, lat: pt.lat, gps_accuracy_m: round(between(3, 9), 1),
    captured_at: capturedAt, device_id: null,
    created_at: capturedAt + 60_000, updated_at: capturedAt + 60_000, deleted_at: null, version: 1,
  });
}
recRows.sort((a, b) => a.captured_at - b.captured_at);
for (const row of recRows) ins("records", row);

// ---------- tareas ----------

const dueIn = (n) => ymdLocal(NOW + n * DAY);
const taskBase = { organization_id: ORG_ID, farm_id: FARM_ID, comments: "[]", checklist: null, prescription: null, lon: null, lat: null, ...synced };
let tn = 0;
const task = (o) => {
  const p = o.plot ? plots[o.plot] : null;
  const row = {
    id: id("task", ++tn), ...taskBase,
    plot_id: p?.id ?? null, assignee_id: people[o.assignee].id, title: o.title, kind: o.kind ?? null,
    due_date: o.due, due_time: o.dueTime ?? null, priority: o.priority ?? "normal", recurrence: o.recurrence ?? "none",
    status: o.status ?? "open", completed_at: o.completedAt ?? null, completed_by: o.completedBy ? people[o.completedBy].id : null,
    record_id: o.recordKey ? recIds[o.recordKey] : null, created_by: people[o.createdBy].id,
    created_at: o.createdAt ?? NOW - 5 * DAY, updated_at: o.completedAt ?? o.createdAt ?? NOW - 5 * DAY,
  };
  if (o.point) { row.lon = o.point.lon; row.lat = o.point.lat; }
  if (o.prescription) {
    const pr = prescriptionSchema.safeParse(o.prescription);
    if (!pr.success) throw new Error(`receta inválida: ${JSON.stringify(pr.error.issues)}`);
    row.prescription = JSON.stringify(pr.data);
  }
  ins("tasks", row);
};
task({ title: "Leer el pluviómetro", plot: "l2", assignee: "ramon", kind: "rain", due: TODAY, dueTime: "08:00", recurrence: "daily", createdBy: "owner", createdAt: NOW - 55 * DAY });
task({
  title: "Revisar chinches en Lote 1", plot: "l1", assignee: "ramon", kind: "pest", due: dueIn(-3), priority: "high",
  createdBy: "ana", point: pointIn(plots.l1), createdAt: NOW - 6 * DAY,
});
task({
  title: "Aplicar insecticida en Lote 6", plot: "l6", assignee: "lidia", kind: "application", due: dueIn(2), priority: "high",
  createdBy: "ana", createdAt: NOW - 1 * DAY,
  prescription: { seasonId: SEASON_ID, products: [{ productId: prodDefs.lambda.id, name: prodDefs.lambda.name, dose: 0.2, unit: "l_ha" }], volumeLHa: 70, note: "Aplicar con viento menor a 12 km/h." },
});
task({ title: "Chequear el molino de la aguada", plot: "p1", assignee: "celso", kind: "water", due: dueIn(1), priority: "high", createdBy: "owner", createdAt: NOW - 2 * DAY });
task({ title: "Contar la hacienda del Potrero Monte", plot: "p2", assignee: "celso", kind: "herd_count", due: dueIn(5), createdBy: "owner", createdAt: NOW - 1 * DAY });
task({
  title: "Contar la hacienda del Potrero Monte (control)", plot: "p2", assignee: "celso", kind: "herd_count", due: dayStr(6), status: "done",
  completedAt: at(6, 9, 20), completedBy: "celso", recordKey: "herd-p2-6", createdBy: "owner", createdAt: NOW - 9 * DAY,
});
task({
  title: "Cosechar el trigo del Lote 3", plot: "l3", assignee: "lidia", kind: "harvest", due: dayStr(5), status: "done",
  completedAt: at(5, 16, 30), completedBy: "lidia", recordKey: "harvest-l3", createdBy: "ana", createdAt: NOW - 12 * DAY,
});
task({
  title: "Recorrer el Lote 5 de girasol", plot: "l5", assignee: "lidia", kind: "scouting", due: dayStr(21), status: "done",
  completedAt: at(21, 15, 40), completedBy: "lidia", recordKey: "scout-l5-21", createdBy: "ana", createdAt: NOW - 25 * DAY,
});

// ---------- aviso de helada ----------

const frostDays = [[1, 2.0], [2, 1.2], [3, 2.0]];
const alertId = id("alert", 1);
const frostFrom = dueIn(1);
const frostTo = dueIn(3);
ins("alerts", {
  id: alertId, organization_id: ORG_ID, farm_id: FARM_ID, kind: "frost", severity: "watch", probability: "medium",
  valid_from: localMs(frostFrom, 0, 0), valid_to: localMs(frostTo, 23, 59), plot_ids: JSON.stringify(cropPlots.map((p) => p.id)),
  summary: "Posible helada: mínima de 1,2 °C",
  details: JSON.stringify({ days: frostDays.map(([n, t]) => ({ date: dueIn(n), tminC: t })), runsConfirming: 2, runsTotal: 3 }),
  source: "MET Norway", dedupe_key: `demo:${FARM_ID}:frost`, resolved_at: null,
  created_at: NOW - 3_600_000, updated_at: NOW - 3_600_000, deleted_at: null, version: 1,
});
for (const p of cropPlots) {
  out.push(`INSERT OR IGNORE INTO alert_plots (alert_id, plot_id) VALUES (${sql(alertId)}, ${sql(p.id)});`);
  count("alert_plots");
}

// El contador de sync nunca baja: solo se crea si no existe.
out.push("INSERT OR IGNORE INTO sync_seq (id, v) VALUES (1, 1);");

const file = fileURLToPath(new URL("../seed/demo.sql", import.meta.url));
writeFileSync(file, out.join("\n") + "\n");
console.log(`Escrito ${file}`);
console.log(JSON.stringify(counts));
console.log(`DEMO_ORG_ID=${ORG_ID}`);
console.log(`DEMO_USER_ID=${OWNER_ID}`);
