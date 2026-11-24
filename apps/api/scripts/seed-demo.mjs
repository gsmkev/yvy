// Genera apps/api/seed/demo.sql: la organización de ejemplo (plan 'demo', solo lectura) para producción.
// Uso: pnpm --filter api seed:demo   (corre con tsx para importar @yvy/shared y @yvy/geo)
//
// - Ids fijos. Casi todo es INSERT OR IGNORE; la estancia, los lotes, los puntos, los registros y las tareas (lo que
//   depende de la geografía y de la fecha) son upserts por id (INSERT ... ON CONFLICT(id) DO UPDATE) que además avanzan
//   `version` para que los celulares ya sincronizados vuelvan a bajarlos. No borran ni cambian ids, así que cargar el
//   SQL sobre la demo existente reemplaza geometrías y fechas sin tocar el resto, y pasa el control de "solo
//   inserciones" de demo.yml (rechaza líneas que empiecen con delete/drop/update/alter).
// - Las fechas son relativas al día en que se corre el script (últimos 60 días), así que se ve vigente.
//   Para refrescarla más adelante alcanza con regenerar y volver a cargar demo.sql: las fechas se corren solas.
// - Cada `data` de los registros se valida con parseRecordData: si algo no valida, el script falla.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { areaHa, bboxOf, centroidOf, containsPoint, overlapRatio } from "@yvy/geo";
import {
  checklistSchema, exportFormatInput, feedRationInput, formConfigSchema, notificationPrefsSchema, orderSchema, parseRecordData,
  prescriptionSchema, RECORD_SCHEMA_VERSION,
} from "@yvy/shared";

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

/** Expresión SQL sin comillas (la versión de sync vigente). */
const raw = (expr) => ({ raw: expr });
const CURRENT_VERSION = raw("(SELECT v FROM sync_seq WHERE id = 1)");
const sql = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object" && "raw" in v) return v.raw;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`número inválido: ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
};
const out = [];
// Tablas que dependen de la geografía o de la fecha del día: se reemplazan al recargar.
const UPSERT = new Set(["farms", "plots", "points_of_interest", "records", "tasks"]);
const KEEP = new Set(["id", "organization_id", "created_at"]);
// Tablas sin columna id: la clave de conflicto es otra (así la estación de servicio y el sistema de la demo se actualizan al recargar).
const CONFLICT_KEY = { farm_livestock_settings: "farm_id" };
const insert = (table, row) => {
  const cols = Object.keys(row);
  const values = `(${cols.join(", ")}) VALUES (${cols.map((c) => sql(row[c])).join(", ")})`;
  if (CONFLICT_KEY[table]) {
    const set = cols.filter((c) => c !== CONFLICT_KEY[table] && !KEEP.has(c)).map((c) => `${c} = excluded.${c}`).join(", ");
    return out.push(`INSERT INTO ${table} ${values} ON CONFLICT(${CONFLICT_KEY[table]}) DO UPDATE SET ${set};`);
  }
  if (!UPSERT.has(table)) return out.push(`INSERT OR IGNORE INTO ${table} ${values};`);
  const set = cols
    .filter((c) => !KEEP.has(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  out.push(`INSERT INTO ${table} ${values} ON CONFLICT(id) DO UPDATE SET ${set};`);
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
out.push(`-- Generado el ${TODAY}. Ids fijos: se puede cargar más de una vez (reemplaza geometrías y fechas, no borra nada).`);
// El contador de sync nunca baja: se crea si falta y avanza una vez por carga, para que los celulares vuelvan a bajar lo reemplazado.
out.push("INSERT OR IGNORE INTO sync_seq (id, v) VALUES (1, 1);");
out.push("INSERT INTO sync_seq (id, v) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET v = v + 1;");

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
  carlos: { n: 6, email: "carlos.duarte@yvy.invalid", name: "Carlos Duarte", role: "supervisor" },
  maria: { n: 7, email: "maria.fernandez@yvy.invalid", name: "María Fernández", role: "admin" },
  hugo: { n: 8, email: "hugo.ferreira@yvy.invalid", name: "Hugo Ferreira", role: "contractor" },
};
for (const p of Object.values(people)) {
  p.id = id("user", p.n);
  ins("users", { id: p.id, email: p.email, full_name: p.name, phone: null, locale: "es-PY", ...ts });
  ins("memberships", {
    id: id("membership", p.n), organization_id: ORG_ID, user_id: p.id, role: p.role, status: "active",
    assignments_version: p.role === "worker" || p.role === "contractor" ? 1 : 0, ...ts,
  });
}

// ---------- estancia, lotes, puntos ----------

const synced = { created_at: T0, updated_at: T0, deleted_at: null, version: CURRENT_VERSION };
const FARM_ID = id("farm", 1);
// Geometrías trazadas a mano sobre un compuesto Sentinel-2 L2A en color natural (S2C_21JXK_20261113, 13/11/2026,
// ~5 x 5 km en Itapúa), siguiendo los bordes reales de chacras y potreros. Los píxeles se pasaron a lon/lat con la
// transformación del ráster (UTM 21 S, 10 m). Siete lotes agrícolas (el 6 en L) y dos potreros; el perímetro de la
// estancia los envuelve con unos 90 m de margen. Las áreas se recalculan abajo con @yvy/geo.
const FARM_RING = [[-55.907232, -27.150688], [-55.91102, -27.152774], [-55.916471, -27.1583], [-55.913707, -27.167978], [-55.909425, -27.172174], [-55.907172, -27.173084], [-55.889068, -27.172034], [-55.888051, -27.16935], [-55.894387, -27.154597], [-55.896792, -27.152599], [-55.907232, -27.150688]];
const LOT_RINGS = {
  l1: [[-55.908676, -27.152474], [-55.907205, -27.15153], [-55.903739, -27.155144], [-55.903663, -27.156046], [-55.906683, -27.153301], [-55.908676, -27.152474]],
  l2: [[-55.90314, -27.157847], [-55.901603, -27.156872], [-55.898617, -27.159407], [-55.895494, -27.162241], [-55.896798, -27.163154], [-55.89985, -27.16068], [-55.90314, -27.157847]],
  l3: [[-55.90347, -27.158572], [-55.897606, -27.16301], [-55.899138, -27.164677], [-55.901321, -27.164995], [-55.904033, -27.16291], [-55.906042, -27.160428], [-55.90347, -27.158572]],
  l4: [[-55.912937, -27.167493], [-55.910572, -27.165097], [-55.908532, -27.163817], [-55.902908, -27.167836], [-55.901951, -27.169423], [-55.903617, -27.171031], [-55.90697, -27.172261], [-55.908827, -27.171523], [-55.910354, -27.170181], [-55.912937, -27.167493]],
  l5: [[-55.914381, -27.157393], [-55.912414, -27.159003], [-55.910446, -27.160703], [-55.911644, -27.162096], [-55.913646, -27.160336], [-55.91558, -27.158576], [-55.914381, -27.157393]],
  l6: [[-55.910416, -27.15342], [-55.906985, -27.153394], [-55.903761, -27.156287], [-55.903809, -27.158334], [-55.905878, -27.160035], [-55.907097, -27.159172], [-55.908163, -27.160234], [-55.909456, -27.158739], [-55.910379, -27.157242], [-55.910416, -27.15342]],
  l7: [[-55.898962, -27.165458], [-55.898462, -27.164972], [-55.893441, -27.169206], [-55.894336, -27.170537], [-55.89664, -27.1689], [-55.898778, -27.167081], [-55.898962, -27.165458]],
  p1: [[-55.898841, -27.153721], [-55.897062, -27.153406], [-55.895161, -27.155077], [-55.895454, -27.156132], [-55.897877, -27.155971], [-55.899033, -27.154746], [-55.898841, -27.153721]],
  p2: [[-55.8931, -27.169655], [-55.890622, -27.168461], [-55.888963, -27.169562], [-55.889651, -27.171373], [-55.891499, -27.171688], [-55.892515, -27.170944], [-55.8931, -27.169655]],
};
const polygon = (ring) => ({ type: "Polygon", coordinates: [ring] });
const bboxCols = (g) => {
  const b = bboxOf(g);
  return { min_lon: b.minLon, min_lat: b.minLat, max_lon: b.maxLon, max_lat: b.maxLat };
};

const farmGeom = polygon(FARM_RING);
const farmCentroid = centroidOf(farmGeom);
ins("farms", {
  id: FARM_ID, organization_id: ORG_ID, name: "Estancia San Pedro", department: "Itapúa", district: "Hohenau",
  geometry: JSON.stringify(farmGeom), ...bboxCols(farmGeom),
  centroid_lon: round(farmCentroid.lon, 6), centroid_lat: round(farmCentroid.lat, 6),
  area_ha: round(areaHa(farmGeom), 2), timezone: "America/Asuncion", offline_pack_version: 0, ...synced,
});

const sown = (daysAgo) => dayStr(daysAgo);
const plotDefs = {
  l1: { n: 1, name: "Lote 1 Norte", kind: "crop", crop: "soja", season: "zafra", sow: 48, geom: polygon(LOT_RINGS.l1), color: "#7A9A3F", worker: "ramon" },
  l2: { n: 2, name: "Lote 2 Maíz", kind: "crop", crop: "maiz", season: "zafra", sow: 58, geom: polygon(LOT_RINGS.l2), color: "#D9A93A", worker: "ramon" },
  l3: { n: 3, name: "Lote 3 Trigo", kind: "crop", crop: "trigo", season: null, sow: 165, geom: polygon(LOT_RINGS.l3), color: "#C9C46A", worker: "lidia" },
  l4: { n: 4, name: "Lote 4 Soja", kind: "crop", crop: "soja", season: "zafra", sow: 42, geom: polygon(LOT_RINGS.l4), color: "#7A9A3F", worker: "ramon" },
  l5: { n: 5, name: "Lote 5 Girasol", kind: "crop", crop: "girasol", season: "zafra", sow: 59, geom: polygon(LOT_RINGS.l5), color: "#D9A93A", worker: "lidia" },
  l6: { n: 6, name: "Lote 6 en L", kind: "crop", crop: "soja", season: "zafra", sow: 38, geom: polygon(LOT_RINGS.l6), color: "#3F6B35", worker: "lidia" },
  l7: { n: 7, name: "Lote 7 Maíz zafrinha", kind: "crop", crop: "maiz", season: "zafrina", sow: 55, geom: polygon(LOT_RINGS.l7), color: "#D9A93A", worker: "lidia" },
  p1: { n: 8, name: "Potrero Aguada", kind: "pasture", pastureType: "Brachiaria", geom: polygon(LOT_RINGS.p1), color: "#8DB3C7", worker: "celso" },
  p2: { n: 9, name: "Potrero Monte", kind: "pasture", pastureType: "Panicum", geom: polygon(LOT_RINGS.p2), color: "#8DB3C7", worker: "celso" },
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

/** Distancia en metros de un punto al borde de un polígono (aproximación plana, de sobra para unos 5 km). */
const edgeDistanceM = (g, lon, lat) => {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  let best = Infinity;
  const ring = g.coordinates[0];
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = [(ring[i][0] - lon) * kx, (ring[i][1] - lat) * ky];
    const [bx, by] = [(ring[i + 1][0] - lon) * kx, (ring[i + 1][1] - lat) * ky];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
};
const MARGIN_M = 20;

/** Punto al azar dentro de un lote, a más de 20 m del borde. */
const pointIn = (p) => {
  const b = bboxOf(p.geom);
  for (let i = 0; i < 2000; i++) {
    const lon = round(between(b.minLon, b.maxLon), 6);
    const lat = round(between(b.minLat, b.maxLat), 6);
    if (containsPoint(p.geom, lon, lat) && edgeDistanceM(p.geom, lon, lat) >= MARGIN_M) return { lon, lat };
  }
  throw new Error(`sin punto dentro de ${p.name}`);
};
const centerOf = (p) => {
  const c = centroidOf(p.geom);
  const lon = round(c.lon, 6), lat = round(c.lat, 6);
  if (!containsPoint(p.geom, lon, lat) || edgeDistanceM(p.geom, lon, lat) < MARGIN_M) throw new Error(`el centroide de ${p.name} queda afuera o pegado al borde`);
  return { lon, lat };
};

// Puntos de interés
const poiDefs = {
  rain: { n: 1, kind: "rain_gauge", name: "Pluviómetro del Lote 2", ...centerOf(plots.l2), plot: "l2" },
  water: { n: 2, kind: "water", name: "Aguada del Potrero Aguada", ...centerOf(plots.p1), plot: "p1" },
  trough: { n: 3, kind: "trough", name: "Bebedero del Potrero Monte", ...centerOf(plots.p2), plot: "p2" },
  // Casco: sobre las construcciones que se ven en la imagen, entre el Lote 2 y el Potrero Aguada. La tranquera, en el camino.
  house: { n: 4, kind: "house", name: "Casa principal", lon: -55.900628, lat: -27.156744 },
  corral: { n: 5, kind: "corral", name: "Corral de encierro", lon: -55.901341, lat: -27.156088 },
  chute: { n: 6, kind: "chute", name: "Manga", lon: -55.901816, lat: -27.1557 },
  gate: { n: 7, kind: "gate", name: "Tranquera de entrada", lon: -55.897739, lat: -27.15293 },
};
for (const p of Object.values(poiDefs)) {
  p.id = id("poi", p.n);
  ins("points_of_interest", {
    id: p.id, organization_id: ORG_ID, farm_id: FARM_ID, kind: p.kind, name: p.name, lon: p.lon, lat: p.lat, ...synced,
  });
}

// Control de la geografía: ningún lote ni potrero se superpone con otro, todos están dentro de la estancia y los puntos caen donde corresponde.
{
  const list = Object.values(plots);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const ratio = overlapRatio(list[i].geom, list[j].geom);
      // Más de 1e-9 (fracción del más chico): ignora el ruido numérico de dos bordes que se tocan.
      if (ratio > 1e-9) throw new Error(`${list[i].name} y ${list[j].name} se superponen (${(ratio * 100).toFixed(2)} % del más chico)`);
    }
}
for (const p of Object.values(plots)) {
  const ring = p.geom.coordinates[0];
  if (!ring.every(([lon, lat]) => containsPoint(farmGeom, lon, lat))) throw new Error(`${p.name} se sale del perímetro de la estancia`);
}
for (const p of Object.values(poiDefs)) {
  if (!containsPoint(farmGeom, p.lon, p.lat)) throw new Error(`${p.name} queda fuera de la estancia`);
  const inPlot = p.plot ? plots[p.plot] : null;
  if (inPlot && !containsPoint(inPlot.geom, p.lon, p.lat)) throw new Error(`${p.name} no cae dentro de ${inPlot.name}`);
}

// Asignaciones de lotes a empleados
let an = 0;
const assignments = [];
for (const p of Object.values(plots)) {
  const a = { id: id("assignment", ++an), plot: p.id, user: people[p.worker].id };
  assignments.push(a);
  ins("plot_assignments", { id: a.id, organization_id: ORG_ID, plot_id: a.plot, user_id: a.user, ...synced });
}

// ---------- el resto de la organización: fixture volcada de la API real ----------
// seed/demo-fixture.json (lo genera scripts/dump-demo-fixture.mjs desde la base que llena seed-manual.mjs) trae las filas de
// una organización completa: el campo, las compras, el stock, los costos, la hacienda, el personal, lo que producen los jobs.
// Acá se rearma como la demo: ids fijos (UUIDv7 con el helper id), personas y lotes de arriba, fechas corridas hasta hoy,
// nombres de empresas inventados. Los derivados (stock, costos, resultados) ya salen coherentes porque los calculó la API.

// La campaña en curso la define la demo; la anterior (cerrada) viene de la fixture.
const SEASON_ID = id("season", 1);
ins("seasons", {
  id: SEASON_ID, organization_id: ORG_ID, name: "Zafra 2026/27", start_date: "2026-09-01", end_date: "2027-06-30",
  active: true, ...synced,
});

const fx = JSON.parse(readFileSync(new URL("../seed/demo-fixture.json", import.meta.url), "utf8"));
const FX = Object.fromEntries(Object.entries(fx.tables).map(([t, rows]) => [t, rows.filter((r) => !r.deleted_at)]));
const SHIFT_MS = Math.round((Date.parse(TODAY) - Date.parse(fx.d0)) / DAY) * DAY;
// ADR 0005: la fixture trae un solo parto (6 terneros) contra 56 servicios; se suma la parición grande de la parición anterior para que el % de parición del ciclo tenga sentido.
{
  const tpl = FX.records.find((r) => r.kind === "reproduction" && JSON.parse(r.data).event === "calving");
  FX.records.push({ ...tpl, id: "01a1df2a-ffff-7000-8000-00000000c411", data: JSON.stringify({ event: "calving", head: 38, calves: 38 }), captured_at: tpl.captured_at - 13 * DAY });
}
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const MAP = new Map(); // id de la fixture -> id de la demo
const skipIds = new Set(); // filas de la fixture que la demo ya trae armadas arriba

MAP.set(FX.memberships[0].organization_id, ORG_ID);
const USER_KEY = {
  "Rodrigo Báez": "owner", "Ing. Ana Villalba": "ana", "Ramón Benítez": "ramon", "Lidia Ortiz": "lidia", "Celso Gamarra": "celso",
  "Carlos Duarte": "carlos", "María Fernández": "maria", "Hugo Ferreira": "hugo",
};
for (const u of FX.users) MAP.set(u.id, people[USER_KEY[u.full_name]].id);
const fxFarm = (name) => FX.farms.find((f) => f.name === name);
const FARM2_ID = id("farm", 2);
MAP.set(fxFarm("Estancia San Pedro").id, FARM_ID);
skipIds.add(fxFarm("Estancia San Pedro").id);
MAP.set(fxFarm("Estancia San Pedro Norte").id, FARM2_ID);
for (const r of FX.plots) {
  const own = Object.values(plots).find((p) => p.name === r.name);
  if (own) { MAP.set(r.id, own.id); skipIds.add(r.id); }
}
const SEASON_OLD_ID = id("season", 2);
for (const s of FX.seasons) {
  const cur = s.name === "Zafra 2026/27";
  MAP.set(s.id, cur ? SEASON_ID : SEASON_OLD_ID);
  if (cur) skipIds.add(s.id);
}
// Productos que la demo ya tenía en producción (mismos ids).
const PRODUCT_PRE = { "Glifosato 48 %": 1, "Engeo Pleno": 2, "Urea 46": 3, "Semilla de soja TMG 7062 IPRO": 4 };
for (const p of FX.products) if (PRODUCT_PRE[p.name]) MAP.set(p.id, id("product", PRODUCT_PRE[p.name]));
// Puntos de interés que ya existen arriba (mismo ids); el galpón se corre porque la fixture lo puso sobre el corral.
const POI_PRE = { "Pluviómetro del Lote 2": poiDefs.rain, "Aguada del Potrero Aguada": poiDefs.water, "Aguada del Potrero Monte": poiDefs.trough, "Casco de la estancia": poiDefs.house, "Corral y manga": poiDefs.corral, "Tranquera de entrada": poiDefs.gate };
for (const p of FX.points_of_interest) if (POI_PRE[p.name]) { MAP.set(p.id, POI_PRE[p.name].id); skipIds.add(p.id); }
for (const t of ["users", "memberships"]) for (const r of FX[t]) skipIds.add(r.id);
// Un lote tiene un solo plan por campaña y un empleado una sola asignación por lote: se reusan los ids de arriba.
const cropOrder = ["l1", "l2", "l3", "l4", "l5", "l6", "l7"].map((k) => plots[k].id);
const assignIdByPair = new Map(assignments.map((a) => [`${a.user}|${a.plot}`, a.id]));

const TABLE_CAT = { farms: "farm", plots: "plot", points_of_interest: "poi", plot_assignments: "assignment", seasons: "season", plot_seasons: "plotSeason", products: "product", tasks: "task", records: "record", alerts: "alert" };
const used = { farm: 1, plot: 9, poi: 7, assignment: 9, season: 2, plotSeason: 7, product: 4, task: 0, record: 0, alert: 1 };
let nextCat = 20;
const catOf = (t) => {
  if (!TABLE_CAT[t]) { CAT[`fx_${t}`] = nextCat++; TABLE_CAT[t] = `fx_${t}`; }
  return TABLE_CAT[t];
};
for (const [t, rows] of Object.entries(FX)) {
  if (!rows.length || !("id" in rows[0]) || t === "users" || t === "memberships") continue;
  const cat = catOf(t);
  used[cat] ??= 0;
  for (const r of rows) {
    if (MAP.has(r.id)) continue;
    if (t === "plot_seasons" && MAP.get(r.season_id) === SEASON_ID && cropOrder.includes(MAP.get(r.plot_id))) {
      MAP.set(r.id, id("plotSeason", cropOrder.indexOf(MAP.get(r.plot_id)) + 1));
      continue;
    }
    if (t === "plot_assignments" && assignIdByPair.has(`${MAP.get(r.user_id)}|${MAP.get(r.plot_id)}`)) {
      MAP.set(r.id, assignIdByPair.get(`${MAP.get(r.user_id)}|${MAP.get(r.plot_id)}`));
      skipIds.add(r.id);
      continue;
    }
    MAP.set(r.id, id(cat, ++used[cat]));
  }
}
// Un uuid que no es de ninguna fila (el grupo de una transferencia de stock, por ejemplo) recibe un id propio la primera vez que aparece.
CAT.ref = 19;
CAT.pastAlert = 18;
CAT.scene = 16;
CAT.stat = 15;
CAT.comment = 17;
let refN = 0;
const mapId = (u) => {
  if (!MAP.has(u)) MAP.set(u, id("ref", ++refN));
  return MAP.get(u);
};

// Nombres inventados para empresas, bancos y laboratorios reales, y correos de prueba.
const RENAME = [
  ["ADM Paraguay S.R.L.", "Granos del Sur S.R.L."], ["ADM Villeta", "Granos del Sur · Villeta"], ["ADM-2026", "GDS-2026"],
  ["Cargill Paraguay S.A.", "Exportadora Paraná S.A."], ["CPA-26", "EXP-26"],
  ["Copetrol S.A.", "Combustibles del Este S.A."], ["Frigorífico Concepción S.A.", "Frigorífico del Norte S.A."],
  ["Cooperativa Colonias Unidas", "Cooperativa Agrícola del Sur"], ["CCU-", "CAS-"],
  ["Banco Itaú", "Banco del Sur"], ["Banco Continental", "Banco Guaraní"],
  ["Laboratorio de suelos UNA", "Laboratorio de suelos regional"], ["@sanpedro.test", "@yvy.invalid"], ["@proveedor.test", "@yvy.invalid"],
];
const NO_SHIFT = {
  seasons: ["start_date", "end_date"], eudr_results: ["ref_from_at", "ref_to_at"],
};
const noShift = (t, col, row) => NO_SHIFT[t]?.includes(col) || (t === "plot_analyses" && row.kind === "cover_change" && ["from_at", "to_at", "ref_key"].includes(col));
const shiftYmd = (s) => new Date(Date.parse(`${s}T00:00:00Z`) + SHIFT_MS).toISOString().slice(0, 10);
const mapValue = (t, col, v, row) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 1.6e12 && v < 1.9e12 && !noShift(t, col, row) ? v + SHIFT_MS : v;
  if (typeof v !== "string") return v;
  let s = v.replace(UUID_RE, mapId);
  if (!noShift(t, col, row)) s = s.replace(/\b20\d\d-\d\d-\d\d\b/g, shiftYmd).replace(/\b1[6-8]\d{11}\b/g, (m) => String(Number(m) + SHIFT_MS));
  for (const [a, b] of RENAME) if (s.includes(a)) s = s.replaceAll(a, b);
  return s;
};

const must = (what, r) => {
  if (!r.success) throw new Error(`${what} no valida: ${JSON.stringify(r.error.issues.slice(0, 3))}`);
  return r.data;
};
const json = (s) => (s == null ? null : JSON.parse(s));
let ordinal = {};
const FIX = {
  // ADR 0005: sistema productivo (ciclo completo: cría, recría y corral) y estación de servicio que abarca el servicio registrado hace unos 80 días.
  farm_livestock_settings: (r) => {
    r.system = "ciclo_completo";
    r.breeding_start = dayStr(80).slice(5);
    r.breeding_days = 60;
  },
  seasons: (r) => { if (r.name === "Zafra 2025/26") { r.start_date = "2025-09-01"; r.end_date = "2026-08-31"; } },
  points_of_interest: (r) => { if (r.name === "Galpón de máquinas") { r.lon = -55.8999; r.lat = -27.1561; } },
  parties: (r) => { ordinal.party = (ordinal.party ?? 0) + 1; r.phone = `+595 21 555 ${String(100 + ordinal.party).padStart(4, "0")}`; },
  employees: (r) => { ordinal.emp = (ordinal.emp ?? 0) + 1; r.ci = `9.000.${String(ordinal.emp).padStart(3, "0")}`; r.phone = `+595 900 000 ${String(ordinal.emp).padStart(3, "0")}`; },
  records: (r) => {
    const parsed = must(`registro ${r.kind} del ${r.captured_at}`, parseRecordData(r.kind, json(r.data)));
    r.data = JSON.stringify(parsed);
    r.device_id = null;
    r.schema_version = RECORD_SCHEMA_VERSION;
    // En la fixture el agrónomo no tiene sesión propia: una de cada tres recorridas y monitoreos pasa a su nombre.
    if (["pest", "scouting", "crop_status"].includes(r.kind) && (ordinal.field = (ordinal.field ?? 0) + 1) % 3 === 0) r.author_id = people.ana.id;
    if (r.captured_at > NOW) throw new Error(`registro ${r.kind} en el futuro`);
  },
  tasks: (r) => {
    // Pocas vencidas: las tres más viejas quedan vencidas y el resto se reparte en los próximos días.
    if (r.status === "open" && r.recurrence === "none" && r.due_date < TODAY && (ordinal.late = (ordinal.late ?? 0) + 1) > 3) r.due_date = ymdLocal(NOW + (1 + (ordinal.late % 9)) * DAY);
    if (r.prescription) r.prescription = JSON.stringify(must("receta", prescriptionSchema.safeParse(json(r.prescription))));
    if (r.checklist) must("checklist", checklistSchema.safeParse(json(r.checklist)));
    if (r.work_order) must("orden de trabajo", orderSchema.safeParse(json(r.work_order)));
  },
  scenes: (r) => { ordinal.scene = (ordinal.scene ?? 0) + 1; r.item_id = `DEMO_S2_${String(ordinal.scene).padStart(3, "0")}`; },
  feed_rations: (r) => { must("ración", feedRationInput.safeParse({ name: r.name, items: json(r.items), note: r.note ?? undefined })); },
  export_formats: (r) => { must("formato de exporte", exportFormatInput.safeParse({ name: r.name, dataset: r.dataset, config: json(r.config) })); },
  form_configs: (r) => { must("formularios propios", formConfigSchema.safeParse(json(r.config))); },
  notification_prefs: (r) => {
    // Un tipo de aviso nuevo (senacsa) entra prendido: la fixture es anterior.
    const p = json(r.prefs);
    for (const k of ["senacsa"]) p.kinds[k] ??= { push: true, email: true };
    r.prefs = JSON.stringify(p);
    must("preferencias", notificationPrefsSchema.safeParse(p));
  },
};
// Tablas que también escriben los jobs reales o cuyo dato es por clave natural: INSERT OR IGNORE, no pisan lo que ya hay.
const IGNORE_TABLES = new Set([
  "climate_daily", "forecasts", "forecast_hours", "plot_forecasts", "farm_risk", "farm_spi", "zone_benchmarks", "exchange_rates",
  "farm_access", "alert_plots", "alert_feedback", "notification_prefs", "form_configs", "farm_alert_settings", "farm_livestock_settings",
  "product_dose_ranges", "record_reviews", "fire_hotspots", "alerts", "eudr_results", "plot_analyses", "management_zones", "problem_areas",
]);
for (const [t, rows] of Object.entries(FX)) if (rows[0] && "id" in rows[0] && !IGNORE_TABLES.has(t)) UPSERT.add(t);

const imp = {}; // filas ya armadas por tabla, para lo que se arma después
const REGENERATED = new Set(["scenes", "plot_index_stats"]); // se rehacen abajo con la curva de cada cultivo
for (const [t, rows] of Object.entries(FX)) {
  if (REGENERATED.has(t)) continue;
  for (const r0 of rows) {
    if (skipIds.has(r0.id)) continue;
    if (t === "climate_daily" && r0.source === "nasa_power") continue; // se rehace abajo, con humedad de suelo coherente con la lluvia
    const row = {};
    for (const [col, v] of Object.entries(r0)) row[col] = mapValue(t, col, v, r0);
    FIX[t]?.(row);
    if ("version" in row) row.version = CURRENT_VERSION;
    ins(t, row);
    (imp[t] ??= []).push(row);
  }
}

// ---------- aviso de helada ----------

const dueIn = (n) => ymdLocal(NOW + n * DAY);
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


// ---------- lo que la fixture no trae: clima de todo el año, avisos pasados, actividad, comentarios ----------

const FARMS = [FARM_ID, FARM2_ID];
const MONTH_MM = [168, 132, 140, 148, 118, 96, 72, 58, 110, 160, 172, 180]; // lluvia mensual normal (mm), Itapúa
const MONTH_TMIN = [20, 19.8, 18.5, 15, 11.5, 9, 8.5, 9.5, 12, 15.5, 17.5, 19.5];
const doyOf = (ymd) => Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${ymd.slice(0, 4)}-01-01T00:00:00Z`)) / DAY) + 1;
const daysIn = (m) => [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];

// Escenas Sentinel-2 y estadísticas de vigor por lote (las escribe el job s2_stats): 17 meses, una escena cada ~5 días sin nubes.
// La curva de cada lote sigue su ciclo real: siembra, pico, senescencia, cosecha y rastrojo; los potreros varían con la estación.
{
  const CYCLE = { soja: 120, maiz: 140, girasol: 115, trigo: 160 };
  const mappedPlot = (oldId) => MAP.get(oldId);
  const info = new Map(); // plot id -> { kind, cycles: [{ sow, len }] } (días atrás)
  const fxPlotById = new Map(FX.plots.map((r) => [MAP.get(r.id), r]));
  for (const [pid, r] of fxPlotById) {
    if (r.kind === "pasture") { info.set(pid, { kind: "pasture", cycles: [] }); continue; }
    const own = Object.values(plots).find((p) => p.id === pid);
    const sowAgo = own ? own.sow : Math.round((Date.parse(TODAY) - Date.parse(shiftYmd(r.sowing_date))) / DAY);
    const cycles = [{ sow: sowAgo, len: CYCLE[r.crop] }];
    const oldPs = FX.plot_seasons.find((ps) => mappedPlot(ps.plot_id) === pid && MAP.get(ps.season_id) === SEASON_OLD_ID);
    const oldHarvest = (imp.records ?? []).find((x) => x.kind === "harvest" && x.plot_id === pid && JSON.parse(x.data).seasonId === SEASON_OLD_ID);
    if (oldPs && oldHarvest) {
      const hAgo = Math.round((NOW - oldHarvest.captured_at) / DAY);
      cycles.push({ sow: hAgo + CYCLE[oldPs.crop], len: CYCLE[oldPs.crop] });
    }
    info.set(pid, { kind: "crop", cycles });
  }
  const ndviOn = (pi, ago) => {
    const month = Number(dayStr(ago).slice(5, 7)) - 1;
    if (pi.kind === "pasture") return 0.6 + 0.09 * Math.cos(((month - 0.5) / 12) * 2 * Math.PI) + 0.03 * Math.sin(ago / 17);
    for (const c of pi.cycles) {
      const a = c.sow - ago, x = a / c.len;
      if (a < 0 || x > 1) continue;
      const v = 0.2 + 0.68 / (1 + Math.exp(-(x - 0.28) / 0.08));
      return x > 0.62 ? v - ((x - 0.62) / 0.38) * 0.5 : v;
    }
    return 0.25 + 0.03 * Math.sin(ago / 23); // rastrojo o barbecho
  };
  let sceneN = 0, statN = 0;
  for (let ago = 2; ago <= 520; ago += 5) {
    if (ago > 3 && rnd() < 0.17) continue; // día con nubes: sin escena útil
    const acquiredAt = at(ago, 13, 40);
    const sceneId = id("scene", ++sceneN);
    ins("scenes", { id: sceneId, source: "sentinel-2", item_id: `DEMO_S2_${String(sceneN).padStart(3, "0")}`, acquired_at: acquiredAt, cloud_pct: round(between(0, 22), 1), processed_at: acquiredAt + 6 * 3_600_000 });
    for (const [pid, pi] of info) {
      const v = Math.min(0.92, Math.max(0.1, ndviOn(pi, ago) + between(-0.025, 0.025)));
      const stat = (idx, mean, p10, p90) => ins("plot_index_stats", {
        id: id("stat", ++statN), organization_id: ORG_ID, plot_id: pid, scene_id: sceneId, acquired_at: acquiredAt, idx, mean: round(mean, 3), p10: round(p10, 3), p90: round(p90, 3),
        valid_pct: round(between(88, 100), 1), created_at: acquiredAt + 6 * 3_600_000, updated_at: acquiredAt + 6 * 3_600_000, deleted_at: null, version: CURRENT_VERSION, low_confidence: false,
      });
      stat("ndvi", v, v - 0.07, Math.min(0.95, v + 0.06));
      const m = 0.1 + v * 0.45 + between(-0.03, 0.03);
      stat("ndmi", m, v * 0.45 - 0.02, v * 0.45 + 0.2);
    }
  }
}

// Normales 1991-2020 por día del año (el job real las calcula con CHIRPS y NASA POWER).
for (const farmId of FARMS)
  for (let doy = 1; doy <= 366; doy++) {
    const m = new Date(Date.UTC(2024, 0, doy)).getUTCMonth();
    const mean = MONTH_MM[m] / daysIn(m);
    const tm = MONTH_TMIN[m];
    const base = { farm_id: farmId, plot_id: "", day_of_year: doy };
    ins("climatology", { ...base, var: "precip", p20: round(mean * 0.25, 2), p50: round(mean * 0.7, 2), p80: round(mean * 1.7, 2), mean: round(mean, 2) });
    ins("climatology", { ...base, var: "tmin", p20: round(tm - 3.5, 1), p50: tm, p80: round(tm + 3, 1), mean: tm });
    ins("climatology", { ...base, var: "soil_top", p20: 0.26, p50: 0.33, p80: 0.4, mean: 0.33 });
    ins("climatology", { ...base, var: "soil_root", p20: 0.27, p50: 0.34, p80: 0.41, mean: 0.34 });
  }

// Lluvia (CHIRPS) y temperatura/humedad de suelo (NASA POWER) diarias: la fixture trae 150 días; acá se completan hasta 14 meses atrás.
// La humedad de suelo se recalcula con un balde simple (sube con la lluvia, baja con la evapotranspiración) para toda la serie.
{
  const have = new Map(); // `${farm}|${date}` -> mm de la fixture
  for (const r of imp.climate_daily ?? []) if (r.source === "chirps" || r.source === "chirps_prelim") have.set(`${r.farm_id}|${r.date}`, r.precip_mm);
  const days = [];
  for (let d = 430; d >= 1; d--) days.push(dayStr(d));
  for (const farmId of FARMS) {
    let top = 0.3, root = 0.32;
    for (const date of days) {
      const month = Number(date.slice(5, 7)) - 1;
      let mm = have.get(`${farmId}|${date}`);
      const real = mm !== undefined;
      if (!real) {
        // día de lluvia con la probabilidad y el monto del mes, para que lo mensual dé cerca de lo normal
        const pRain = Math.min(0.45, MONTH_MM[month] / 330);
        mm = rnd() < pRain ? round(Math.min(70, (MONTH_MM[month] / daysIn(month) / pRain) * between(0.15, 1.9)), 1) : 0;
      }
      const et = [11, 0, 1].includes(month) ? 0.011 : [5, 6, 7].includes(month) ? 0.004 : 0.007;
      top = Math.min(0.44, Math.max(0.17, top + mm * 0.006 - et));
      root = Math.min(0.42, Math.max(0.2, root + (top - root) * 0.12));
      const warm = [10, 11, 0, 1, 2].includes(month) ? 7 : [3, 8, 9].includes(month) ? 2 : [4, 7].includes(month) ? -2 : -5;
      if (!real) ins("climate_daily", { farm_id: farmId, plot_id: "", date, source: "chirps", precip_mm: mm, tmin_c: null, tmax_c: null, soil_moisture_0_7: null, soil_moisture_7_28: null });
      const t = MONTH_TMIN[month];
      // NASA POWER: la fila de la fixture (si la hay) se reemplaza por una con humedad coherente; INSERT OR IGNORE no pisa lo que ya escribió el job real
      ins("climate_daily", { farm_id: farmId, plot_id: "", date, source: "nasa_power", precip_mm: null,
        tmin_c: round(t + between(-3.5, 3.5) + (mm > 8 ? -1.5 : 0), 1), tmax_c: round(t + 11 + warm * 0.4 + between(-4, 5) - (mm > 8 ? 4 : 0), 1),
        soil_moisture_0_7: round(top, 3), soil_moisture_7_28: round(root, 3) });
    }
  }
}

// Avisos pasados (ya resueltos) con los votos de "¿Te sirvió?".
const pastAlerts = [
  { kind: "frost", severity: "watch", probability: "medium", from: 26, to: 24, summary: "Posible helada: mínima de 1,8 °C", source: "MET Norway", votes: [["owner", 1, null], ["ana", 1, "Llegó con tiempo para tapar el semillero."]] },
  { kind: "excess_rain", severity: "watch", probability: "high", from: 33, to: 30, summary: "Exceso de lluvia: 74 mm pronosticados (72 h)", source: "MET Norway", votes: [["owner", 1, null], ["maria", 0, "Cayeron 40 mm, menos de lo avisado."]] },
  { kind: "fire", severity: "warning", probability: null, from: 41, to: 41, summary: "Foco de calor a 6,4 km de la estancia", source: "NASA FIRMS", votes: [["ana", 1, null]] },
  { kind: "pest_threshold", severity: "watch", probability: null, from: 12, to: 6, summary: "Chinche sobre el umbral en el Lote 1 Norte", source: "Registros de monitoreo", votes: [["owner", 1, "Justo antes de la aplicación."], ["ana", 1, null]] },
  { kind: "drought", severity: "watch", probability: "medium", from: 58, to: 50, summary: "Déficit de lluvia de 52 % en 30 días", source: "CHIRPS", votes: [["owner", 0, "Ya habíamos regado."]] },
];
pastAlerts.forEach((a, i) => {
  const aid = id("pastAlert", i + 1);
  const plotIds = a.kind === "pest_threshold" ? [plots.l1.id] : cropPlots.map((p) => p.id);
  const created = at(a.from, 6, 30);
  ins("alerts", {
    id: aid, organization_id: ORG_ID, farm_id: FARM_ID, kind: a.kind, severity: a.severity, probability: a.probability,
    valid_from: created, valid_to: at(a.to, 23, 59), plot_ids: JSON.stringify(plotIds), summary: a.summary, details: JSON.stringify({ plotIds }),
    source: a.source, dedupe_key: `demo:${FARM_ID}:past:${i + 1}`, resolved_at: at(a.to, 23, 59), created_at: created, updated_at: at(a.to, 23, 59),
    deleted_at: null, version: CURRENT_VERSION,
  });
  for (const pid of plotIds) ins("alert_plots", { alert_id: aid, plot_id: pid });
  for (const [who, useful, comment] of a.votes) ins("alert_feedback", { alert_id: aid, user_id: people[who].id, useful, comment });
});

// Actividad de las personas en los últimos días (lo que muestra "Empleados activos" y la columna de Equipo).
for (let d = 0; d < 14; d++) {
  const dow = new Date(NOW - d * DAY).getUTCDay();
  const rolesToday = [["owner", d % 2 === 0], ["ana", d % 3 !== 1], ["maria", d % 2 === 1 || d < 3], ["carlos", d % 4 === 0],
    ["ramon", dow !== 0], ["lidia", dow !== 0 && d !== 5], ["celso", dow !== 0 && d !== 3], ["hugo", d === 2 || d === 9]];
  for (const [who, on] of rolesToday) if (on) ins("activity_daily", { user_id: people[who].id, organization_id: ORG_ID, day: dayStr(d), role: people[who].role });
}

// Comentarios sobre registros (con @menciones).
{
  const first = (kind, pred = () => true) => (imp.records ?? []).filter((r) => r.kind === kind && pred(JSON.parse(r.data))).sort((a, b) => b.captured_at - a.captured_at)[0];
  const picks = [
    [first("pest", (d) => d.intensity === "high"), "ana", "Supera el umbral. Programemos la aplicación para esta semana.", [], 20],
    [first("pest", (d) => d.intensity === "high"), "owner", `Dale, que sea con el Engeo. @[${people.ana.name}] avisame cuando esté lista la receta.`, [people.ana.id], 140],
    [first("application"), "ramon", "Se aplicó con viento de 8 km/h, sin deriva hacia el camino.", [], 30],
    [first("weighing", (d) => d.head > 50), "owner", "Buena ganancia diaria en el corral, seguimos con la misma ración.", [], 60],
    [first("note"), "lidia", "Confirmo: pasé por el lote el sábado y estaba en condiciones.", [], 15],
  ].filter(([rec]) => rec);
  picks.forEach(([rec, who, body, mentions, mins], i) => {
    const t = rec.captured_at + mins * 60_000 + i * 3_600_000;
    if (t > NOW) return;
    ins("comments", { id: id("comment", i + 1), organization_id: ORG_ID, record_id: rec.id, author_id: people[who].id, author_name: people[who].name, body, mentions: JSON.stringify(mentions), created_at: t, updated_at: t, deleted_at: null, version: CURRENT_VERSION });
  });
}

// Comparación con la zona (job zone_benchmarks): vigor y lluvia de las estancias vecinas.
for (const [farmId, ndvi, mm] of [[FARM_ID, 0.6, 158], [FARM2_ID, 0.66, 171]])
  ins("zone_benchmarks", { farm_id: farmId, organization_id: ORG_ID, computed_at: NOW - 6 * 3_600_000, radius_km: 10, window_days: 30, n_farms: 14, ndvi, ndvi_median: round(ndvi - 0.03, 2), rain_mm: mm, rain_median_mm: round(mm * 0.92, 0) });


const file = fileURLToPath(new URL("../seed/demo.sql", import.meta.url));
writeFileSync(file, out.join("\n") + "\n");
console.log(`Escrito ${file}`);
console.log(JSON.stringify(counts));
console.log(`DEMO_ORG_ID=${ORG_ID}`);
console.log(`DEMO_USER_ID=${OWNER_ID}`);
