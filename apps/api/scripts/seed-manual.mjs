// Carga una organización de ejemplo completa ("Agropecuaria San Pedro") contra una API local en marcha, para sacar
// capturas del manual de la web. Usa los mismos endpoints que la web y la app (el campo entra por /sync/push; lo que
// viene de jobs externos, por /ingest firmado). Fechas relativas a hoy.
//
// Uso:  (con tsx, porque importa @yvy/shared)  API_URL=http://localhost:8787 DEV_LOG=<log de wrangler dev> pnpm --filter api seed:manual
// Opcionales: OWNER_EMAIL (por defecto dueno@sanpedro.test; si ya existe se crea otra organización con sufijo),
//             INGEST_SECRET (por defecto el de apps/api/.dev.vars).
// Al final imprime el email del dueño y la sesión (JSON) lista para localStorage["yvy.session"].
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRecordData, libroIvaConfig } from "@yvy/shared";

const API = (process.env.API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const DEV_LOG = process.env.DEV_LOG ?? "";
const DAY = 86_400_000;
const NOW = Date.now();
const ymd = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const dayStr = (ago) => ymd(NOW - ago * DAY);
const TODAY = dayStr(0);
const at = (ago, h = 8, m = 0) => Date.parse(`${dayStr(ago)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let seedN = 424242;
const rnd = () => {
  seedN = (seedN + 0x6d2b79f5) | 0;
  let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rnd() * (b - a);
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/** UUIDv7: 48 bits de milisegundos + aleatorio. */
let lastMs = 0;
function uuidv7(ms = Date.now()) {
  ms = Math.max(ms, lastMs + 1);
  lastMs = ms;
  const b = randomBytes(16);
  b[0] = (ms / 2 ** 40) & 255; b[1] = (ms / 2 ** 32) & 255; b[2] = (ms >>> 24) & 255; b[3] = (ms >>> 16) & 255; b[4] = (ms >>> 8) & 255; b[5] = ms & 255;
  b[6] = (b[6] & 0x0f) | 0x70; b[7] = b[7]; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- HTTP ----------
class ApiError extends Error {}
async function raw(method, path, body, token, headers = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
  if (!res.ok) throw new ApiError(`${method} ${path} -> ${res.status}: ${text.slice(0, 600)}`);
  return json;
}

// ---------- ingreso por código (el código sale del log de wrangler en desarrollo) ----------
const readCode = (email) => {
  if (!DEV_LOG || !existsSync(DEV_LOG)) throw new Error("Falta DEV_LOG (log de wrangler dev) para leer el código de ingreso");
  const all = [...readFileSync(DEV_LOG, "utf8").matchAll(new RegExp(`para=${email.replace(/[.+]/g, "\\$&")}[^\\n]*\\n[^\\n]*?código es (\\d{6})`, "g"))];
  return all.map((m) => m[1]);
};
async function login(email, organizationId) {
  const before = existsSync(DEV_LOG) ? readCode(email).length : 0;
  await raw("POST", "/auth/email/start", { email });
  let code;
  for (let i = 0; i < 40; i++) {
    const c = readCode(email);
    if (c.length > before) { code = c.at(-1); break; }
    await sleep(250);
  }
  if (!code) throw new Error(`No apareció el código de ${email} en ${DEV_LOG}`);
  return raw("POST", "/auth/email/verify", { email, code, deviceId: `manual-${email.split("@")[0]}`.slice(0, 60), ...(organizationId ? { organizationId } : {}) });
}
/** Cliente con el token de una sesión; renueva si vence. */
function client(session) {
  const c = {
    session,
    async call(method, path, body) {
      try { return await raw(method, path, body, c.session.accessToken); }
      catch (e) {
        if (!/-> 401/.test(String(e.message))) throw e;
        c.session = await raw("POST", "/auth/refresh", { refreshToken: c.session.refreshToken });
        return raw(method, path, body, c.session.accessToken);
      }
    },
    get: (p) => c.call("GET", p),
    post: (p, b) => c.call("POST", p, b ?? {}),
    put: (p, b) => c.call("PUT", p, b ?? {}),
    patch: (p, b) => c.call("PATCH", p, b ?? {}),
    del: (p) => c.call("DELETE", p),
  };
  return c;
}

// ---------- ingest firmado ----------
function devVar(name) {
  if (process.env[name]) return process.env[name];
  const f = fileURLToPath(new URL("../.dev.vars", import.meta.url));
  const m = existsSync(f) && readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`Falta ${name} (variable de entorno o apps/api/.dev.vars)`);
  return m[1].trim();
}
async function ingest(method, path, body) {
  const secret = devVar("INGEST_SECRET");
  const ts = Date.now();
  const text = body === undefined ? "" : JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(`${ts}.${method}.${path}.${text}`).digest("hex");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "x-yvy-timestamp": String(ts), "x-yvy-signature": sig, ...(text ? { "content-type": "application/json" } : {}) },
    body: text || undefined,
  });
  const out = await res.text();
  if (!res.ok) throw new ApiError(`ingest ${method} ${path} -> ${res.status}: ${out.slice(0, 400)}`);
  return out ? JSON.parse(out) : null;
}
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const log = (...a) => console.error("·", ...a);
const S = {}; // estado compartido entre pasos

// ---------- geografía (Itapúa, Hohenau) ----------
// Estancia 1: geometrías trazadas sobre imagen Sentinel-2 (las mismas de seed-demo.mjs).
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
const rect = (lon, lat, w, h) => [[lon, lat], [lon + w, lat], [lon + w, lat + h], [lon, lat + h], [lon, lat]];
// Estancia 2: bloques rectangulares con pequeñas irregularidades.
const N0 = [-55.868, -27.112];
const N_RINGS = {
  n1: [[N0[0], N0[1]], [N0[0] + 0.0105, N0[1] - 0.0004], [N0[0] + 0.0108, N0[1] + 0.0072], [N0[0] + 0.0002, N0[1] + 0.0075], [N0[0], N0[1]]],
  n2: rect(N0[0] + 0.0115, N0[1], 0.0094, 0.0072),
  n3: rect(N0[0] + 0.0215, N0[1] + 0.0002, 0.0082, 0.0070),
  n4: rect(N0[0], N0[1] - 0.0085, 0.0120, 0.0070),
  np: [[N0[0] + 0.0128, N0[1] - 0.0085], [N0[0] + 0.0250, N0[1] - 0.0083], [N0[0] + 0.0252, N0[1] - 0.0016], [N0[0] + 0.0128, N0[1] - 0.0014], [N0[0] + 0.0128, N0[1] - 0.0085]],
};
const N_FARM = [[N0[0] - 0.0008, N0[1] - 0.0095], [N0[0] + 0.0305, N0[1] - 0.0095], [N0[0] + 0.0307, N0[1] + 0.0083], [N0[0] - 0.0008, N0[1] + 0.0085], [N0[0] - 0.0008, N0[1] - 0.0095]];

const PLOTS = {
  // estancia 1 (key, nombre, tipo, cultivo, zafra, siembra hace N días, geometría, color, empleado)
  l1: { farm: 1, name: "Lote 1 Norte", kind: "crop", crop: "soja", season: "zafra", sow: 48, ring: LOT_RINGS.l1, variety: "TMG 7062 IPRO", target: 3.6, w: "ramon" },
  l2: { farm: 1, name: "Lote 2 Maíz", kind: "crop", crop: "maiz", season: "zafra", sow: 58, ring: LOT_RINGS.l2, variety: "Pioneer P3707", target: 9.5, w: "ramon" },
  l3: { farm: 1, name: "Lote 3 Trigo", kind: "crop", crop: "trigo", season: null, sow: 165, ring: LOT_RINGS.l3, variety: "Biointa 1005", target: 3.2, w: "lidia" },
  l4: { farm: 1, name: "Lote 4 Soja", kind: "crop", crop: "soja", season: "zafra", sow: 42, ring: LOT_RINGS.l4, variety: "Nidera 5909", target: 3.5, w: "ramon" },
  l5: { farm: 1, name: "Lote 5 Girasol", kind: "crop", crop: "girasol", season: "zafra", sow: 59, ring: LOT_RINGS.l5, variety: "Paraíso 33", target: 2.4, w: "lidia" },
  l6: { farm: 1, name: "Lote 6 en L", kind: "crop", crop: "soja", season: "zafra", sow: 38, ring: LOT_RINGS.l6, variety: "Brasmax Desafio", target: 3.7, w: "lidia" },
  l7: { farm: 1, name: "Lote 7 Maíz zafrinha", kind: "crop", crop: "maiz", season: "zafrina", sow: 55, ring: LOT_RINGS.l7, variety: "DKB 390", target: 7.8, w: "lidia" },
  p1: { farm: 1, name: "Potrero Aguada", kind: "pasture", pastureType: "Brachiaria", ring: LOT_RINGS.p1, w: "celso" },
  p2: { farm: 1, name: "Potrero Monte", kind: "pasture", pastureType: "Panicum", ring: LOT_RINGS.p2, w: "celso" },
  // estancia 2
  n1: { farm: 2, name: "Chacra Norte 1", kind: "crop", crop: "soja", season: "zafra", sow: 45, ring: N_RINGS.n1, variety: "Brasmax Olimpo", target: 3.6, w: "ramon" },
  n2: { farm: 2, name: "Chacra Norte 2", kind: "crop", crop: "maiz", season: "zafra", sow: 62, ring: N_RINGS.n2, variety: "DKB 355", target: 9.0, w: "lidia" },
  n3: { farm: 2, name: "Chacra Norte 3", kind: "crop", crop: "girasol", season: "zafra", sow: 52, ring: N_RINGS.n3, variety: "Paraíso 20", target: 2.2, w: "lidia" },
  n4: { farm: 2, name: "Chacra Norte 4", kind: "crop", crop: "soja", season: "zafra", sow: 40, ring: N_RINGS.n4, variety: "Nidera 5909", target: 3.4, w: "ramon" },
  np: { farm: 2, name: "Corral de engorde Norte", kind: "pasture", pastureType: "Encierre", ring: N_RINGS.np, w: "celso" },
};
const COLORS = { soja: "#7A9A3F", maiz: "#D9A93A", trigo: "#C9C46A", girasol: "#D9A93A", pasture: "#8DB3C7" };
const centerOfRing = (ring) => {
  const pts = ring.slice(0, -1);
  return { lon: round(pts.reduce((a, p) => a + p[0], 0) / pts.length, 6), lat: round(pts.reduce((a, p) => a + p[1], 0) / pts.length, 6) };
};

const TEAM = {
  admin: { fullName: "María Fernández", email: "maria.fernandez@sanpedro.test", phone: "+595981200101", role: "admin" },
  ana: { fullName: "Ing. Ana Villalba", email: "ana.villalba@sanpedro.test", phone: "+595981200102", role: "agronomist" },
  carlos: { fullName: "Carlos Duarte", email: "carlos.duarte@sanpedro.test", phone: "+595981200103", role: "supervisor" },
  ramon: { fullName: "Ramón Benítez", email: "ramon.benitez@sanpedro.test", phone: "+595981200104", role: "worker" },
  lidia: { fullName: "Lidia Ortiz", email: "lidia.ortiz@sanpedro.test", phone: "+595981200105", role: "worker" },
  celso: { fullName: "Celso Gamarra", email: "celso.gamarra@sanpedro.test", phone: "+595981200106", role: "worker" },
  hugo: { fullName: "Hugo Ferreira", email: "hugo.ferreira@sanpedro.test", phone: "+595981200107", role: "contractor" },
};

// ---------- paso 1: organización, dueño, estancias, lotes, puntos, líneas ----------
async function stepOrg() {
  let email = process.env.OWNER_EMAIL, orgName = "Agropecuaria San Pedro";
  const fixed = !!email;
  email ||= "dueno@sanpedro.test";
  for (let n = 1; ; n++) {
    const tryEmail = fixed || n === 1 ? email : email.replace("@", `${n}@`);
    try {
      await raw("POST", "/auth/signup", { organizationName: n > 1 && !fixed ? `${orgName} ${n}` : orgName, fullName: "Rodrigo Báez", email: tryEmail });
      S.ownerEmail = tryEmail;
      break;
    } catch (e) {
      if (/409/.test(e.message) && fixed) { S.ownerEmail = tryEmail; break; } // ya existe: se reutiliza la organización
      if (!/409/.test(e.message) || n > 30) throw e;
    }
  }
  S.owner = client(await login(S.ownerEmail));
  log("organización creada; dueño", S.ownerEmail);
}

async function stepGeography() {
  const o = S.owner;
  S.farms = {};
  const defs = [
    { n: 1, name: "Estancia San Pedro", district: "Hohenau", ring: FARM_RING },
    { n: 2, name: "Estancia San Pedro Norte", district: "Obligado", ring: N_FARM },
  ];
  for (const d of defs) {
    const r = await o.post("/org/farms", { name: d.name, department: "Itapúa", district: d.district, geometry: polygon(d.ring) });
    S.farms[d.n] = { id: r.id, name: d.name };
  }
  S.plots = {};
  for (const n of [1, 2]) {
    const keys = Object.keys(PLOTS).filter((k) => PLOTS[k].farm === n);
    const r = await o.post(`/org/farms/${S.farms[n].id}/plots`, {
      plots: keys.map((k) => {
        const p = PLOTS[k];
        return {
          name: p.name, kind: p.kind, geometry: polygon(p.ring), crop: p.crop ?? null, season: p.season ?? null,
          sowingDate: p.sow ? dayStr(p.sow) : null, pastureType: p.pastureType ?? null, color: COLORS[p.crop ?? "pasture"],
        };
      }),
    });
    r.warnings?.length && log("avisos de geometría", JSON.stringify(r.warnings));
    keys.forEach((k, i) => (S.plots[k] = { key: k, id: r.ids[i], farmId: S.farms[n].id, ...PLOTS[k] }));
  }
  const poi = (farm, kind, name, lon, lat) => o.post(`/org/farms/${S.farms[farm].id}/pois`, { kind, name, lon, lat });
  const c = (k) => centerOfRing(PLOTS[k].ring);
  S.pois = {
    rain1: await poi(1, "rain_gauge", "Pluviómetro del Lote 2", c("l2").lon, c("l2").lat),
    rain2: await poi(1, "rain_gauge", "Pluviómetro del Lote 5", c("l5").lon, c("l5").lat),
    rain3: await poi(2, "rain_gauge", "Pluviómetro Norte", c("n1").lon, c("n1").lat),
    water1: await poi(1, "water", "Aguada del Potrero Aguada", c("p1").lon, c("p1").lat),
    water2: await poi(1, "water", "Aguada del Potrero Monte", c("p2").lon, c("p2").lat),
    water3: await poi(2, "water", "Aguada del corral Norte", c("np").lon, c("np").lat),
  };
  await poi(1, "house", "Casco de la estancia", -55.900628, -27.156744);
  await poi(1, "shed", "Galpón de máquinas", -55.901341, -27.156088);
  await poi(1, "corral", "Corral y manga", -55.901816, -27.1557);
  await poi(1, "gate", "Tranquera de entrada", -55.897739, -27.15293);
  await poi(1, "mill", "Molino", c("p2").lon + 0.0004, c("p2").lat + 0.0003);
  await poi(1, "silo", "Silo de acopio", -55.9004, -27.1572);
  await poi(2, "house", "Casa de la Norte", N0[0] + 0.0128, N0[1] - 0.0100 + 0.0004);
  await poi(2, "shed", "Galpón Norte", N0[0] + 0.0150, N0[1] - 0.0100 + 0.0004);
  const line = (farm, kind, name, coords) => S.owner.post(`/org/farms/${S.farms[farm].id}/lines`, { kind, name, geometry: { type: "LineString", coordinates: coords } });
  await line(1, "fence", "Alambrado norte", [[-55.9071, -27.1509], [-55.9, -27.1514], [-55.8968, -27.1527]]);
  await line(1, "fence", "Alambrado del Potrero Monte", [[-55.8895, -27.1688], [-55.8928, -27.1696], [-55.8934, -27.1718]]);
  await line(1, "road", "Camino al casco", [[-55.8977, -27.1529], [-55.8995, -27.1550], [-55.9006, -27.1567]]);
  await line(1, "road", "Camino interno sur", [[-55.9006, -27.1567], [-55.9035, -27.1645], [-55.9055, -27.1722]]);
  await line(1, "stream", "Arroyo Pira", [[-55.9141, -27.1630], [-55.9100, -27.1651], [-55.9086, -27.1675]]);
  await line(2, "road", "Camino vecinal", [[N0[0] - 0.0007, N0[1] + 0.0080], [N0[0] + 0.0130, N0[1] + 0.0083], [N0[0] + 0.0262, N0[1] + 0.0080]]);
  await line(2, "fence", "Alambrado Norte", [[N0[0] - 0.0007, N0[1] - 0.0094], [N0[0] + 0.0130, N0[1] - 0.0094], [N0[0] + 0.0260, N0[1] - 0.0094]]);
  log("estancias, lotes, puntos y líneas");
}


// ---------- paso 2: equipo, campañas, productos, maestros ----------
async function stepTeam() {
  const o = S.owner;
  const orgId = o.session.organization.id;
  S.team = {};
  for (const [k, m] of Object.entries(TEAM)) {
    const r = await o.post("/org/members", m);
    S.team[k] = { key: k, userId: r.userId, ...m };
  }
  const t = S.team;
  const farmIds = (...n) => n.map((i) => ({ farmId: S.farms[i].id, level: "edit" }));
  await o.put(`/org/members/${t.ana.userId}/farms`, { farms: farmIds(1, 2) });
  await o.put(`/org/members/${t.carlos.userId}/farms`, { farms: farmIds(1, 2) });
  await o.put(`/org/members/${t.admin.userId}/farms`, { farms: farmIds(1, 2) }).catch(() => {});
  for (const w of ["ramon", "lidia", "celso"]) {
    const ids = Object.values(S.plots).filter((p) => p.w === w).map((p) => p.id);
    await o.put(`/org/members/${t[w].userId}/plots`, { plotIds: ids });
  }
  await o.put(`/org/members/${t.hugo.userId}/plots`, { plotIds: [S.plots.l1.id, S.plots.l4.id, S.plots.l6.id, S.plots.n1.id, S.plots.n4.id] });
  // áreas reales de los lotes
  for (const n of [1, 2]) {
    const d = await o.get(`/org/farms/${S.farms[n].id}`);
    for (const p of d.plots) {
      const k = Object.keys(S.plots).find((x) => S.plots[x].id === p.id);
      if (k) S.plots[k].areaHa = round(p.areaHa, 2);
    }
  }
  // sesiones de los demás miembros (para que los registros tengan autores distintos)
  // (el tope de códigos por IP es de 10 por hora: solo ingresa por código el agrónomo, si se pide ANA_LOGIN=1; los empleados entran con el PIN, como en el celular)
  S.sessions = { owner: o };
  if (process.env.ANA_LOGIN) S.sessions.ana = client(await login(TEAM.ana.email, orgId)); // opcional: un código más; sin esto sus registros salen a nombre del dueño
  for (const k of ["ramon", "lidia", "celso"]) {
    const { pin } = await o.put(`/org/members/${t[k].userId}/pin`, {});
    S.sessions[k] = client(await raw("POST", "/auth/pin/login", { phone: TEAM[k].phone, pin, deviceId: `manual-${k}` }));
    S.team[k].pin = pin;
  }
  log("equipo y sesiones");
}

async function stepCatalog() {
  const o = S.owner;
  S.seasons = {};
  S.seasons.old = (await o.post("/org/seasons", { name: "Zafra 2025/26", startDate: "2025-09-01", endDate: "2026-04-30", active: false })).id;
  S.seasons.cur = (await o.post("/org/seasons", { name: "Zafra 2026/27", startDate: "2026-05-01", endDate: "2027-06-30", active: true })).id;
  // plan por lote de la campaña en curso
  for (const p of Object.values(S.plots).filter((x) => x.kind === "crop")) {
    await o.put(`/org/seasons/${S.seasons.cur}/plots/${p.id}`, {
      crop: p.crop, variety: p.variety, plannedSowingDate: dayStr(p.sow), targetYieldTHa: p.target,
      ...(p.crop === "maiz" || p.crop === "soja" ? { sowingDensity: p.crop === "soja" ? 14 : 3.2, densityUnit: "seeds_m" } : { sowingDensity: 4, densityUnit: "kg_ha" }),
    });
  }
  // campaña cerrada: rotación del año pasado
  const old = { l1: ["maiz", "DKB 390", 8.8], l2: ["soja", "TMG 7062 IPRO", 3.4], l3: ["soja", "Nidera 5909", 3.3], l4: ["maiz", "Pioneer P3707", 9.1], l5: ["soja", "Brasmax Desafio", 3.5], l6: ["trigo", "Biointa 1005", 3.0], l7: ["soja", "TMG 7062 IPRO", 3.2], n1: ["maiz", "DKB 355", 8.5], n2: ["soja", "Brasmax Olimpo", 3.5], n3: ["soja", "Nidera 5909", 3.3], n4: ["maiz", "DKB 390", 8.9] };
  S.oldPlan = old;
  for (const [k, [crop, variety, target]] of Object.entries(old)) {
    await o.put(`/org/seasons/${S.seasons.old}/plots/${S.plots[k].id}`, { crop, variety, plannedSowingDate: crop === "trigo" ? "2025-06-10" : crop === "maiz" ? "2025-09-12" : "2025-10-20", targetYieldTHa: target });
  }
  const P = (name, type, unit, ai, wd, tox) => ({ name, type, unit, activeIngredient: ai, withdrawalDays: wd, toxClass: tox });
  const defs = {
    sSoja: P("Semilla de soja TMG 7062 IPRO", "seed", "kg"), sMaiz: P("Semilla de maíz Pioneer P3707", "seed", "kg"),
    sGira: P("Semilla de girasol Paraíso 33", "seed", "kg"), sTrigo: P("Semilla de trigo Biointa 1005", "seed", "kg"),
    glifo: P("Glifosato 48 %", "agrochemical", "l", "Glifosato", 14, "IV"), engeo: P("Engeo Pleno", "agrochemical", "l", "Lambda-cialotrina + Tiametoxam", 21, "II"),
    fungi: P("Orquestra Ultra", "agrochemical", "l", "Fluxapyroxad + Piraclostrobin", 28, "III"), d24: P("2,4-D amina", "agrochemical", "l", "2,4-D", 7, "III"),
    atra: P("Atrazina 90 WG", "agrochemical", "kg", "Atrazina", 30, "III"), cipe: P("Cipermetrina 25 %", "agrochemical", "l", "Cipermetrina", 15, "II"),
    urea: P("Urea 46", "fertilizer", "kg", "Nitrógeno 46 %"), dap: P("Fosfato diamónico 18-46-0", "fertilizer", "kg", "N 18 % + P2O5 46 %"), kcl: P("Cloruro de potasio", "fertilizer", "kg", "K2O 60 %"),
    gasoil: P("Gasoil", "fuel", "l"),
    ivermec: P("Ivermectina 1 %", "veterinary", "l", "Ivermectina", 35, "IV"), aftosa: P("Vacuna antiaftosa", "veterinary", "l"), garrap: P("Garrapaticida Cypermil", "veterinary", "l", "Cipermetrina", 14, "III"),
    maizG: P("Maíz grano", "other", "kg"), silaje: P("Silaje de maíz", "other", "kg"), expeller: P("Expeller de soja", "other", "kg"), nucleo: P("Núcleo mineral", "other", "kg"), sal: P("Sal mineral", "other", "kg"),
  };
  S.prod = {};
  for (const [k, d] of Object.entries(defs)) {
    const r = await o.post("/org/products", d);
    S.prod[k] = { id: r.id, ...d };
  }
  const dr = (k, min, max) => o.put(`/org/products/${S.prod[k].id}/dose-range`, { min, max });
  await dr("glifo", 1, 4); await dr("engeo", 0.2, 0.5); await dr("fungi", 0.3, 0.6); await dr("urea", 60, 200); await dr("d24", 0.5, 1.5);
  // umbrales de avisos, hacienda, preferencias, formularios propios
  await o.put(`/org/farms/${S.farms[1].id}/alert-settings`, { frostTminC: 3, excessRainMm24h: 60, droughtDeficitPct: 45 });
  await o.put(`/org/farms/${S.farms[2].id}/alert-settings`, { frostTminC: 2, excessRainMm24h: 50, droughtDeficitPct: 50 });
  await o.put(`/org/farms/${S.farms[1].id}/livestock-settings`, { maxUaPerHa: 1.2 }).catch((e) => log("livestock-settings:", e.message));
  await o.put("/me/notification-prefs", {
    kinds: Object.fromEntries(["frost", "excess_rain", "drought", "fire", "pest_threshold", "water_low", "heat_stress", "rust_risk"].map((k) => [k, { push: true, email: !["heat_stress", "rust_risk"].includes(k) }])),
    quiet: { enabled: true, start: "21:00", end: "06:00" },
  });
  await o.put("/org/form-config", {
    pest: [{ id: "lote_vecino", label: "Lote vecino con aplicación reciente", type: "yesno" }, { id: "estadio", label: "Estadio del cultivo", type: "choice", options: ["V3", "V6", "R1", "R3", "R5"] }],
    application: [{ id: "boquilla", label: "Tipo de boquilla", type: "choice", options: ["Abanico plano", "Cono hueco", "Anti-deriva"] }, { id: "caldo_ph", label: "pH del caldo", type: "number" }],
    herd_count: [{ id: "estado_pasto", label: "Estado del pasto", type: "text" }],
  });
  log("campañas, productos, umbrales, formularios");
}

async function stepErpMasters() {
  const o = S.owner;
  const e = (p) => `/org/erp/${p}`;
  S.wh = {};
  const wh = async (k, farm, name, type, isDefault) => (S.wh[k] = (await o.post(e("warehouses"), { farmId: S.farms[farm].id, name, type, isDefault })).id);
  await wh("insumos", 1, "Galpón de insumos", "shed", true); await wh("tanque", 1, "Tanque de combustible", "tank", false);
  await wh("silo", 1, "Silo de acopio", "silo", false); await wh("norte", 2, "Galpón Norte", "shed", true);
  S.machines = {};
  const mc = async (k, d) => (S.machines[k] = { id: (await o.post(e("machines"), { ...d, farmId: S.farms[1].id })).id, name: d.name });
  await mc("tractor", { name: "Tractor John Deere 6110J", type: "tractor", brand: "John Deere", model: "6110J", year: 2017, meterKind: "hours", meterValue: 4820 });
  await mc("pulve", { name: "Pulverizadora Jacto Uniport 3030", type: "sprayer", brand: "Jacto", model: "Uniport 3030", year: 2019, meterKind: "hours", meterValue: 3210 });
  await mc("cosech", { name: "Cosechadora Case 2388", type: "harvester", brand: "Case IH", model: "2388", year: 2012, meterKind: "hours", meterValue: 6980 });
  await mc("sembr", { name: "Sembradora Stara Absoluta", type: "planter", brand: "Stara", model: "Absoluta", year: 2020, meterKind: "hours", meterValue: 1540 });
  await mc("hilux", { name: "Camioneta Toyota Hilux", type: "pickup", brand: "Toyota", model: "Hilux SRV", year: 2021, meterKind: "km", meterValue: 86400 });
  await mc("camion", { name: "Camión Mercedes-Benz 1634", type: "truck", brand: "Mercedes-Benz", model: "1634", year: 2014, meterKind: "km", meterValue: 412000 });
  S.party = {};
  const party = async (k, name, ruc, kind, phone, address) => (S.party[k] = (await o.post(e("parties"), { name, ruc, kind, phone, email: `${k}@proveedor.test`, address })).id);
  await party("agrofertil", "Agrofértil S.A.", "80012345-6", "supplier", "+595 21 555 0101", "Ruta 6 km 28, Hohenau");
  await party("coop", "Cooperativa Colonias Unidas", "80004567-2", "both", "+595 71 203 400", "Obligado, Itapúa");
  await party("copetrol", "Copetrol S.A.", "80021890-1", "supplier", "+595 21 555 0140", "Ruta 1 km 340, Encarnación");
  await party("vet", "Veterinaria El Ganadero", "80033411-7", "supplier", "+595 71 205 220", "Av. Irrazábal 410, Encarnación");
  await party("repuestos", "Repuestos Hohenau", "1234567-8", "supplier", "+595 767 240 115", "Hohenau centro");
  await party("semillas", "Semillas del Sur S.R.L.", "80045678-9", "supplier", "+595 71 207 300", "Capitán Meza");
  await party("adm", "ADM Paraguay S.R.L.", "80009876-5", "customer", "+595 21 617 7000", "Villeta");
  await party("cargill", "Cargill Paraguay S.A.", "80010234-0", "customer", "+595 21 617 3000", "Puerto San Antonio");
  await party("frigo", "Frigorífico Concepción S.A.", "80007654-3", "customer", "+595 331 242 100", "Concepción");
  await party("cabana", "Cabaña Santa Rosa", "80051122-4", "supplier", "+595 981 330 220", "San Pedro del Paraná");
  // tipo de cambio: un valor por semana
  for (let d = 126; d >= 0; d -= 7) await o.put(e(`exchange-rates/${dayStr(d)}`), { usdToPyg: Math.round(7350 + (126 - d) * 1.6 + Math.sin(d) * 25) });
  await o.put(e(`exchange-rates/${TODAY}`), { usdToPyg: 7570 });
  log("depósitos, máquinas, proveedores y clientes, tipo de cambio");
}

// ---------- sincronización: el campo entra por /sync/push, como desde el celular ----------
async function push(who, mutations) {
  const c = who === "owner" ? S.owner : (S.sessions[who] ?? S.owner);
  const results = [];
  const send = async (batch) => {
    try {
      const r = await c.post("/sync/push", { deviceId: `manual-${who}`, mutations: batch });
      results.push(...r.results);
    } catch (e) {
      if (/-> 503/.test(e.message) && batch.length > 1) { const h = batch.length >> 1; await send(batch.slice(0, h)); await send(batch.slice(h)); return; }
      throw e;
    }
  };
  for (const part of chunks(mutations, 20)) await send(part);
  const bad = results.filter((r) => r.status === "rejected");
  if (bad.length) throw new Error(`/sync/push rechazó ${bad.length} de ${results.length} (${who}): ${JSON.stringify(bad.slice(0, 3))}`);
  return results;
}
const jitter = (v, d) => round(v + between(-d, d), 6);
/** Arma un registro de campo, validado con el esquema real. */
function rec(kind, plotKey, daysAgo, hour, data, o = {}) {
  const plot = S.plots[plotKey];
  const parsed = parseRecordData(kind, data);
  if (!parsed.success) throw new Error(`registro ${kind} inválido (${plotKey}): ${JSON.stringify(parsed.error.issues.slice(0, 2))}`);
  const c = o.lonlat ?? centerOfRing(plot.ring);
  const capturedAt = o.capturedAt ?? at(daysAgo, hour, Math.floor(rnd() * 50));
  const id = o.id ?? uuidv7(capturedAt);
  return {
    id, author: o.author ?? plot.w, capturedAt,
    mutation: {
      mutationId: uuidv7(), kind: "records.upsert",
      row: { id, farmId: plot.farmId, plotId: plot.id, poiId: o.poi ?? null, kind, data: parsed.data, schemaVersion: 1, lon: o.noGps ? null : jitter(c.lon, 0.0002), lat: o.noGps ? null : jitter(c.lat, 0.0002), gpsAccuracyM: o.noGps ? null : round(between(3, 9), 1), capturedAt },
    },
  };
}
async function pushRecords(list) {
  const by = {};
  for (const r of list) (by[r.author] ??= []).push(r);
  for (const [who, rs] of Object.entries(by)) await push(who, rs.sort((a, b) => a.capturedAt - b.capturedAt).map((r) => r.mutation));
  S.nRecords = (S.nRecords ?? 0) + list.length;
}

// ---------- paso 3: compras y stock ----------
async function stepPurchases() {
  const o = S.owner, e = (p) => `/org/erp/${p}`, P = S.prod, W = S.wh, Y = S.party;
  S.purchases = {};
  const buy = async (key, o2) => {
    const { lines, receive, invoice, ...head } = o2;
    const r = await o.post(e("purchases"), { currency: "PYG", farmId: S.farms[1].id, ...head, lines });
    S.purchases[key] = { id: r.id, currency: head.currency ?? "PYG" };
    if (invoice) await o.post(e(`purchases/${r.id}/invoice`), invoice);
    if (receive) await o.post(e(`purchases/${r.id}/receive`), receive);
  };
  const L = (prod, qty, unitPrice, extra = {}) => ({ productId: P[prod].id, qty, unitPrice, ...extra });
  await buy("semillas", { partyId: Y.semillas, orderDate: dayStr(112), note: "Semilla para la zafra 2026/27", lines: [L("sSoja", 5200, 9800), L("sMaiz", 1100, 21500), L("sGira", 260, 33000), L("sTrigo", 1800, 3600)], invoice: { invoiceNumber: "001-001-0004812", invoiceDate: dayStr(111), dueDate: dayStr(80) }, receive: { warehouseId: W.insumos, date: dayStr(108) } });
  await buy("agro", { partyId: Y.agrofertil, orderDate: dayStr(96), currency: "USD", note: "Agroquímicos de la zafra", lines: [L("glifo", 1200, 410, { lot: "GL-2611" }), L("engeo", 160, 6200, { lot: "EP-0933", expiresOn: dayStr(-420) }), L("fungi", 220, 3800, { lot: "OU-7710", expiresOn: dayStr(-300) }), L("d24", 180, 520), L("cipe", 90, 760, { lot: "CP-4402", expiresOn: dayStr(-22) }), L("atra", 400, 650)], invoice: { invoiceNumber: "001-002-0019340", invoiceDate: dayStr(95), dueDate: dayStr(35) }, receive: { warehouseId: W.insumos, date: dayStr(92) } });
  await buy("ferti", { partyId: Y.coop, orderDate: dayStr(94), note: "Fertilizantes", lines: [L("urea", 16000, 4500), L("dap", 9000, 6200), L("kcl", 5000, 5400)], invoice: { invoiceNumber: "002-001-0001155", invoiceDate: dayStr(93), dueDate: dayStr(50) }, receive: { warehouseId: W.insumos, date: dayStr(91) } });
  await buy("norte", { partyId: Y.agrofertil, farmId: S.farms[2].id, orderDate: dayStr(88), currency: "USD", note: "Insumos para la Norte", lines: [L("glifo", 500, 410), L("engeo", 60, 6200), L("fungi", 80, 3800), L("urea", 5000, 620)], invoice: { invoiceNumber: "001-002-0019812", invoiceDate: dayStr(87), dueDate: dayStr(20) }, receive: { warehouseId: W.norte, date: dayStr(85) } });
  await buy("norte-pyg", { partyId: Y.coop, farmId: S.farms[2].id, orderDate: dayStr(86), lines: [L("dap", 3000, 6200), L("kcl", 1500, 5400), L("cipe", 25, 98000)], invoice: { invoiceNumber: "002-001-0001390", invoiceDate: dayStr(85), dueDate: dayStr(40) }, receive: { warehouseId: W.norte, date: dayStr(84) } });
  await buy("gasoil", { partyId: Y.copetrol, orderDate: dayStr(75), note: "Gasoil a granel", lines: [L("gasoil", 12000, 7150)], invoice: { invoiceNumber: "003-001-0077412", invoiceDate: dayStr(75), dueDate: dayStr(-12) }, receive: { warehouseId: W.tanque, date: dayStr(74) } });
  await buy("gasoil2", { partyId: Y.copetrol, orderDate: dayStr(18), lines: [L("gasoil", 8000, 7380)], invoice: { invoiceNumber: "003-001-0079020", invoiceDate: dayStr(18), dueDate: dayStr(-4) }, receive: { warehouseId: W.tanque, date: dayStr(17) } });
  await buy("vet", { partyId: Y.vet, orderDate: dayStr(41), lines: [L("ivermec", 40, 98000, { lot: "IV-2309", expiresOn: dayStr(-38) }), L("aftosa", 30, 150000, { lot: "AF-1105", expiresOn: dayStr(-150) }), L("garrap", 25, 85000)], invoice: { invoiceNumber: "001-001-0030077", invoiceDate: dayStr(40), dueDate: dayStr(-7) }, receive: { warehouseId: W.insumos, date: dayStr(39) } });
  await buy("feedlot", { partyId: Y.coop, orderDate: dayStr(62), note: "Insumos del corral de engorde", lines: [L("maizG", 24000, 1500), L("expeller", 9000, 3800), L("silaje", 30000, 350), L("nucleo", 3000, 5200), L("sal", 2500, 2600)], invoice: { invoiceNumber: "002-001-0001244", invoiceDate: dayStr(61), dueDate: dayStr(31) }, receive: { warehouseId: W.insumos, date: dayStr(60) } });
  await buy("pedido", { partyId: Y.agrofertil, orderDate: dayStr(3), expectedDate: dayStr(-6), currency: "USD", note: "Fungicida para la segunda aplicación", lines: [L("fungi", 120, 3800), L("engeo", 40, 6200)] });
  await buy("repuestos", { partyId: Y.repuestos, orderDate: dayStr(22), note: "Filtros y aceite hidráulico", lines: [{ description: "Filtros y aceite hidráulico del tractor", category: "machinery", activity: "agricultura", qty: 1, unitPrice: 2_850_000 }], invoice: { invoiceNumber: "001-003-0008821", invoiceDate: dayStr(21), dueDate: dayStr(6) } });
  await buy("neumaticos", { partyId: Y.repuestos, orderDate: dayStr(30), lines: [{ description: "Juego de neumáticos de la pulverizadora", category: "machinery", activity: "agricultura", qty: 4, unitPrice: 3_400_000 }], invoice: { invoiceNumber: "001-003-0008530", invoiceDate: dayStr(29), dueDate: dayStr(-14) } });
  // IVA de las facturas (libro IVA del contador)
  for (const [k, g10, g5, ex] of [["agro", 0.9, 0.1, 0], ["ferti", 1, 0, 0], ["gasoil", 1, 0, 0], ["repuestos", 1, 0, 0]]) {
    const d = await o.get(e(`purchases/${S.purchases[k].id}`));
    const total = d.totalPyg ?? d.amountPyg ?? 0;
    if (total) await o.put(e("export/taxes"), { docKind: "purchase", docId: S.purchases[k].id, timbrado: "15894476", gross10: Math.round(total * g10), gross5: Math.round(total * g5), exempt: ex }).catch((er) => log("IVA:", er.message.slice(0, 120)));
  }
  log("compras y recepciones");
}

// ---------- paso 4: ERP, segunda parte (contratistas, personal, mantenimiento, labor propia, raciones) ----------
async function stepErpMasters2() {
  const o = S.owner, e = (p) => `/org/erp/${p}`, M = S.machines, P = S.prod;
  S.contractors = {};
  const ct = async (k, d) => (S.contractors[k] = (await o.post(e("contractors"), { currency: "PYG", ...d })).id);
  await ct("hugo", { name: "Hugo Ferreira Servicios Agrícolas", partyId: S.party.coop, service: "harvest", rateUnit: "ha", rateAmount: 420_000, note: "Cosecha con cosechadora propia del contratista" });
  await ct("hugoSiembra", { name: "Hugo Ferreira · Siembra", service: "sowing", rateUnit: "ha", rateAmount: 150_000 });
  await ct("pulve", { name: "Aeroaplicaciones Itapúa", service: "spraying", rateUnit: "ha", rateAmount: 38_000 });
  await ct("flete", { name: "Transportes Paraná", service: "freight", rateUnit: "ton", rateAmount: 95_000, note: "Flete al puerto de Encarnación" });
  // labor propia frente a contratista (E-23)
  await o.put(e(`machine-costs/${M.pulve.id}`), { service: "spraying", purchasePricePyg: 780_000_000, residualPyg: 250_000_000, lifeHours: 10000, operatorPerHourPyg: 28_000, haPerHour: 28, fuelLitersPerHour: 14 });
  await o.put(e(`machine-costs/${M.cosech.id}`), { service: "harvest", purchasePricePyg: 950_000_000, residualPyg: 300_000_000, lifeHours: 8000, operatorPerHourPyg: 35_000, haPerHour: 4.5, fuelLitersPerHour: 38 });
  await o.put(e(`machine-costs/${M.sembr.id}`), { service: "sowing", purchasePricePyg: 310_000_000, residualPyg: 120_000_000, lifeHours: 6000, operatorPerHourPyg: 26_000, haPerHour: 6, fuelLitersPerHour: 18 });
  // mantenimiento preventivo (E-22)
  S.plans = {};
  const plan = async (k, m, name, every, last) => (S.plans[k] = (await o.post(e("maintenance-plans"), { machineId: M[m].id, name, everyUnits: every, lastDoneMeter: last })).id);
  await plan("tAceite", "tractor", "Cambio de aceite y filtros", 250, 4540); // vencido (toca a las 4790 h y va por 4820)
  await plan("tHidr", "tractor", "Aceite hidráulico", 1000, 4100);
  await plan("pAceite", "pulve", "Aceite y filtros del motor", 300, 3000); // próximo
  await plan("cEngrase", "cosech", "Engrase general", 100, 6900);
  await plan("hAceite", "hilux", "Service de 10.000 km", 10000, 80000);
  await plan("camion", "camion", "Cambio de aceite", 15000, 405000);
  await o.post(e("maintenance/logs"), { machineId: M.tractor.id, planId: S.plans.tAceite, kind: "preventive", date: dayStr(62), meterValue: 4540, description: "Aceite 15W40 y filtros de aire y combustible", partyId: S.party.repuestos, amount: 1_450_000, currency: "PYG" });
  await o.post(e("maintenance/logs"), { machineId: M.pulve.id, kind: "repair", date: dayStr(33), meterValue: 3150, description: "Cambio de bomba de pulverización", partyId: S.party.repuestos, amount: 4_200_000, currency: "PYG" });
  await o.post(e("maintenance/logs"), { machineId: M.hilux.id, planId: S.plans.hAceite, kind: "preventive", date: dayStr(70), meterValue: 80000, description: "Service de 80.000 km", amount: 1_950_000, currency: "PYG" });
  await o.post(e("maintenance/logs"), { machineId: M.cosech.id, planId: S.plans.cEngrase, kind: "preventive", date: dayStr(15), meterValue: 6900, description: "Engrase general previo a la cosecha de trigo", amount: 380_000, currency: "PYG" });
  // personal (E-25) y raciones (G-33)
  S.emp = {};
  const emp = async (k, name, ci, wage) => (S.emp[k] = (await o.post(e("employees"), { name, ci, phone: "+595 981 " + (200000 + Math.floor(rnd() * 99999)), dailyWagePyg: wage })).id);
  await emp("ramon", "Ramón Benítez", "3.456.789", 135_000); await emp("lidia", "Lidia Ortiz", "4.120.553", 135_000); await emp("celso", "Celso Gamarra", "2.998.014", 130_000);
  await emp("pedro", "Pedro Cabral", "3.774.210", 120_000); await emp("nilda", "Nilda Rojas", "5.001.867", 115_000); await emp("juan", "Juan Villalba", "4.552.390", 120_000);
  const item = (k, pctDm, dmPct) => ({ productId: P[k].id, pctDm, dmPct });
  S.rations = {};
  S.rations.term = (await o.post(e("feedlot/rations"), { name: "Terminación 70/30", items: [item("maizG", 62, 88), item("expeller", 14, 90), item("silaje", 21, 35), item("nucleo", 3, 98)], note: "Novillos en el corral de engorde, 90 días" })).id;
  S.rations.recria = (await o.post(e("feedlot/rations"), { name: "Recría", items: [item("maizG", 38, 88), item("expeller", 10, 90), item("silaje", 49, 35), item("nucleo", 3, 98)] })).id;
  log("contratistas, labor propia, mantenimiento, personal, raciones");
}

// ---------- paso 5: registros de campo ----------
const RAIN = [[1, 6], [3, 14], [4, 22], [8, 3], [9, 35], [12, 48], [14, 9], [19, 17], [21, 26], [27, 5], [31, 41], [34, 12], [40, 19], [44, 8], [49, 63], [52, 15], [58, 28], [63, 7], [67, 34], [72, 11], [78, 22], [84, 16], [88, 9]];
const trackLine = (plot, n = 9) => {
  const c = centerOfRing(plot.ring);
  return Array.from({ length: n }, (_, i) => [round(c.lon - 0.0014 + i * 0.00035, 6), round(c.lat - 0.0006 + Math.sin(i / 1.6) * 0.0005, 6)]);
};
async function stepRecords() {
  const o = S.owner, P = S.prod, PL = S.plots, cur = S.seasons.cur;
  const out = [];
  const R = (...a) => out.push(rec(...a));
  const crops = Object.keys(PL).filter((k) => PL[k].kind === "crop");
  // órdenes de trabajo: dos cerradas con contratista (siembra y cosecha) y una abierta de aplicación
  const order = async (assignee, plotKeys, dueDays, ord, title) => {
    const r = await o.post("/org/erp/work-orders", { farmId: PL[plotKeys[0]].farmId, plotIds: plotKeys.map((k) => PL[k].id), assigneeId: S.team[assignee].userId, dueDate: dayStr(dueDays), title, order: { seasonId: cur, ...ord } });
    return r.ids ?? [r.id];
  };
  const [oSow] = await order("lidia", ["l6"], 40, { labor: "sowing", contractorId: S.contractors.hugoSiembra, areaHa: PL.l6.areaHa }, "Siembra de soja en el Lote 6");
  const [oHar] = await order("lidia", ["l3"], 16, { labor: "harvest", contractorId: S.contractors.hugo, areaHa: PL.l3.areaHa }, "Cosecha de trigo del Lote 3");
  const [oFence] = await order("celso", ["p1"], 20, { labor: "other", note: "Reparar el alambrado del Potrero Aguada" }, "Reparación de alambrado");
  S.orders = { oSow, oHar, oFence };
  const spray = { labor: "spraying", machineId: S.machines.pulve.id, volumeLHa: 80, products: [{ productId: P.fungi.id, name: P.fungi.name, dose: 0.4, unit: "l_ha" }] };
  await order("ramon", ["l1", "l4"], -2, { ...spray, note: "Fungicida preventivo antes de R3" }, "Fungicida en soja Lote 1 y 4");
  await order("ramon", ["n1"], 3, { ...spray, products: [{ productId: P.engeo.id, name: P.engeo.name, dose: 0.25, unit: "l_ha" }] }, "Insecticida en Chacra Norte 1");
  await order("lidia", ["l5"], -6, { labor: "fertilizing", products: [{ productId: P.urea.id, name: P.urea.name, dose: 90, unit: "kg_ha" }] }, "Urea en girasol");
  // lluvia en tres pluviómetros
  for (const [d, mm] of RAIN) {
    R("rain", "l2", d, 7, { mm, readAt: at(d, 7, 5) }, { poi: S.pois.rain1.id, author: "ramon" });
    if (rnd() < 0.85) R("rain", "l5", d, 7, { mm: round(mm * between(0.8, 1.25)), readAt: at(d, 7, 20) }, { poi: S.pois.rain2.id, author: "lidia" });
    if (rnd() < 0.8) R("rain", "n1", d, 8, { mm: round(mm * between(0.7, 1.3)), readAt: at(d, 8, 10) }, { poi: S.pois.rain3.id, author: "ramon" });
  }
  // siembras de la campaña en curso (y la del lote 6 cierra una orden de trabajo)
  for (const k of crops) {
    const p = PL[k];
    const dens = p.crop === "soja" ? { density: 14, densityUnit: "seeds_m" } : p.crop === "girasol" ? { density: 4, densityUnit: "kg_ha" } : { density: p.crop === "trigo" ? 110 : 3.2, densityUnit: p.crop === "trigo" ? "kg_ha" : "seeds_m" };
    R("sowing", k, p.sow, 8, { seasonId: cur, crop: p.crop, variety: p.variety, ...dens, areaHa: p.areaHa, ...(k === "l6" ? { orderTaskId: oSow, hours: round(p.areaHa / 6, 1) } : {}) });
  }
  // cosecha del trigo (cierra la orden) y de la campaña anterior
  R("harvest", "l3", 16, 10, { seasonId: cur, tons: round(PL.l3.areaHa * 3.15, 1), moisturePct: 12.5, areaHa: PL.l3.areaHa, destination: "acopio", orderTaskId: oHar, hours: round(PL.l3.areaHa / 4.5, 1) });
  S.oldHarvest = {};
  for (const [k, [crop, , target]] of Object.entries(S.oldPlan)) {
    const p = PL[k];
    const tons = round(p.areaHa * target * between(0.92, 1.07), 1);
    S.oldHarvest[k] = { tons, crop };
    R("harvest", k, crop === "trigo" ? 205 : crop === "maiz" ? 250 : 262 + Math.floor(between(0, 14)), 11, { seasonId: S.seasons.old, tons, moisturePct: crop === "soja" ? 13 : crop === "maiz" ? 15 : 12, areaHa: p.areaHa, destination: k.startsWith("n") ? "acopio" : "silo" }, { author: "owner" });
  }
  // fertilizaciones y aplicaciones (consumen stock y cargan costo al lote)
  const F = (d, k, prod, dose, method) => R("fertilization", k, d, 9, { seasonId: cur, products: [{ productId: P[prod].id, name: P[prod].name, dose, unit: "kg_ha" }], method, areaHa: PL[k].areaHa });
  F(50, "l1", "dap", 150, "banded"); F(49, "l1", "kcl", 80, "broadcast"); F(47, "n1", "dap", 130, "banded"); F(44, "l4", "dap", 120, "banded");
  F(32, "n2", "urea", 120, "broadcast"); F(30, "l2", "urea", 120, "broadcast"); F(25, "l7", "urea", 100, "banded");
  const A = (d, k, list, vol, who) => R("application", k, d, 7, {
    seasonId: cur, products: list.map(([pk, dose, unit]) => ({ productId: P[pk].id, name: P[pk].name, dose, unit })), volumeLHa: vol, areaHa: PL[k].areaHa,
    windKmh: round(between(3, 14)), tempC: round(between(18, 29)), humidityPct: Math.round(between(50, 80)), machine: S.machines.pulve.name,
    extra: undefined,
  }, who ? { author: who } : {});
  for (const k of ["l1", "l4", "l6", "n1", "n4"]) A(PL[k].sow + 12, k, [["glifo", 2.5, "l_ha"], ["d24", 0.8, "l_ha"]], 80);
  for (const k of ["l1", "l4", "l6"]) A(PL[k].sow - 20, k, [["glifo", 2, "l_ha"]], 80);
  A(46, "l2", [["atra", 2, "kg_ha"], ["glifo", 2, "l_ha"]], 90); A(48, "n2", [["atra", 2, "kg_ha"], ["glifo", 2, "l_ha"]], 90);
  A(28, "l5", [["glifo", 6, "l_ha"]], 80); // fuera del rango habitual: aparece en "Para revisar"
  for (const [d, k] of [[12, "l1"], [8, "l4"], [5, "l6"], [10, "n1"], [14, "n4"]]) A(d, k, [["engeo", 0.25, "l_ha"]], 80);
  A(20, "l2", [["engeo", 0.3, "l_ha"]], 90); A(15, "l5", [["cipe", 0.2, "l_ha"]], 80);
  A(6, "l1", [["fungi", 0.4, "l_ha"]], 80); A(3, "n1", [["fungi", 0.4, "l_ha"]], 80);
  // monitoreo: plagas, estado del cultivo, recorridas
  const pest = (d, k, o2, who) => R("pest", k, d, 10, o2, who ? { author: who } : {});
  pest(8, "l1", { pest: "chinche", perMeter: 3.2, crop: "soja", intensity: "high", note: "Chinche verde en las vainas, sobre el umbral" });
  pest(7, "l4", { pest: "chinche", perMeter: 1.4, crop: "soja", intensity: "medium" });
  pest(6, "l6", { pest: "chinche", perMeter: 2.6, crop: "soja", intensity: "high" });
  pest(11, "n1", { pest: "oruga", perMeter: 24, crop: "soja", intensity: "high", note: "Oruga de las leguminosas" });
  pest(18, "l1", { pest: "oruga", perMeter: 9, crop: "soja", intensity: "medium" });
  pest(14, "l2", { pest: "otra", intensity: "low", crop: "maiz", note: "Cogollero en baja densidad" });
  pest(21, "n4", { pest: "malezas", intensity: "medium", crop: "soja", note: "Rama negra escapada" });
  pest(9, "l6", { pest: "roya", intensity: "low", crop: "soja", note: "Primeras pústulas en hojas bajeras" });
  pest(5, "l1", { pest: "chinche", crop: "soja", stations: [{ lon: -55.9055, lat: -27.1535, counts: { chinche: 4, oruga: 6 } }, { lon: -55.9045, lat: -27.1545, counts: { chinche: 3, oruga: 8 } }, { lon: -55.9038, lat: -27.1552, counts: { chinche: 2, oruga: 4 } }], averages: { chinche: 3, oruga: 6 } }, "ramon");
  const stage = (k, d) => { const age = PL[k].sow - d; return age < 12 ? "emergencia" : age < 30 ? "vegetativo" : age < 48 ? "floracion" : "llenado"; };
  for (const k of crops.filter((x) => x !== "l3")) for (const d of [30, 17, 4]) if (PL[k].sow > d + 4) R("crop_status", k, d, 9, { stage: stage(k, d), condition: pick(["good", "good", "fair"]), note: d === 4 ? "Buen cierre de entresurco" : undefined });
  R("crop_status", "l5", 6, 9, { stage: "floracion", condition: "bad", note: "Marchitez por el herbicida aplicado a dosis alta" });
  R("crop_status", "l3", 24, 9, { stage: "madurez", condition: "good" });
  for (const [d, k, c, n] of [[35, "l2", "good", "Emergencia pareja"], [26, "n3", "fair", "Plantas con ataque de hormiga cortadora en bordes"], [13, "l7", "good"], [9, "n2", "good", "Buen llenado"], [2, "l4", "good"], [20, "n4", "fair", "Zonas con encharcamiento"]]) R("scouting", k, d, 8, { condition: c, note: n });
  for (const [d, k] of [[16, "l1"], [9, "n2"], [4, "l4"]]) {
    const p = PL[k], t0 = at(d, 8, 0);
    R("track", k, d, 8, { line: trackLine(p), distanceM: 1180, durationS: 1500, startedAt: t0, endedAt: t0 + 1_500_000, note: "Recorrida de monitoreo" });
  }
  R("irrigation", "l5", 10, 18, { mm: 18, method: "pivot", appliedAt: at(10, 18) }); R("irrigation", "l5", 4, 18, { mm: 12, method: "pivot", appliedAt: at(4, 18) });
  for (const [d, k, txt, who] of [[40, "l2", "Se reparó la tranquera del Lote 2 por el paso de maquinaria.", "ramon"], [22, "n1", "Vecino avisó que va a aplicar con avión el viernes; se coordinó el aviso.", "owner"], [12, "l4", "Fuerte tormenta de granizo en el sector oeste; revisar daños.", "ramon"], [7, "p2", "Se encontró un bebedero con pérdida; se cambió el flotante.", "celso"], [3, "l6", "Pendiente del análisis de suelo del sector bajo.", "lidia"], [1, "l1", "Entra el contratista a cosechar el lunes si el clima acompaña.", "owner"]])
    R("note", k, d, 15, { text: txt }, { author: who });
  // combustible
  const FU = [[88, "tractor", 220, 4585], [80, "pulve", 180, 3050], [70, "tractor", 240, 4640], [57, "sembr", 160, 1450], [48, "tractor", 260, 4705], [35, "pulve", 190, 3150], [26, "hilux", 70, 85100], [18, "tractor", 250, 4760], [9, "pulve", 170, 3200], [4, "tractor", 210, 4815], [2, "hilux", 65, 86300]];
  for (const [d, m, lt, mv] of FU) R("fuel_load", "l1", d, 17, { machineId: S.machines[m].id, machine: S.machines[m].name, liters: lt, meterValue: mv, productId: P.gasoil.id }, { author: "owner" });
  S.records = out;
  await pushRecords(out);
  // cierre de las órdenes de trabajo hechas
  const done = (taskId, who, recId, daysAgo) => push(who, [{ mutationId: uuidv7(), kind: "tasks.status", row: { id: taskId, status: "done", completedAt: at(daysAgo, 17), recordId: recId } }]);
  const sRec = out.find((r) => r.mutation.row.kind === "sowing" && r.mutation.row.plotId === PL.l6.id), hRec = out.find((r) => r.mutation.row.kind === "harvest" && r.mutation.row.plotId === PL.l3.id);
  await done(oSow, "lidia", sRec.id, 38); await done(oHar, "lidia", hRec.id, 16);
  await done(oFence, "celso", null, 18);
  log(`${out.length} registros de campo y órdenes de trabajo`);
}

// ---------- paso 6: tareas ----------
async function stepTasks() {
  const o = S.owner, PL = S.plots, T = S.team;
  const have = new Map((await o.get("/org/tasks")).map((x) => [x.title, x.id])); // idempotente si se retoma
  const task = async (who, plotKeys, title, due, extra = {}) => {
    if (have.has(title)) return [have.get(title)];
    const first = PL[plotKeys[0]];
    const c = extra.pin ? centerOfRing(first.ring) : null;
    const { pin, ...rest } = extra;
    const r = await o.post("/org/tasks", {
      farmId: first.farmId, plotIds: plotKeys.map((k) => PL[k].id), assigneeId: T[who].userId, title, dueDate: dayStr(due), priority: "normal", recurrence: "none",
      ...(c ? { lon: c.lon, lat: c.lat } : {}), ...rest,
    });
    return r.ids ?? [r.id];
  };
  await task("ramon", ["l2"], "Medir lluvia en el pluviómetro", 0, { kind: "rain", dueTime: "07:00", recurrence: "daily", checklist: ["Leer el pluviómetro", "Vaciar y limpiar el embudo"] });
  await task("celso", ["p1"], "Revisar el nivel de las aguadas", -1, { kind: "water", recurrence: "weekly" });
  const [mon] = await task("ramon", ["l1", "l4", "l6"], "Monitoreo de chinche en soja", 1, { kind: "pest", priority: "high", dueTime: "09:00", pin: true, checklist: ["Contar chinches por metro en 10 puntos", "Sacar foto de la vaina", "Anotar el estadio del cultivo"] });
  await task("celso", ["p1"], "Conteo de hacienda en la manga", 3, { kind: "herd_count", checklist: ["Contar por categoría", "Anotar si falta algún animal"] });
  await task("lidia", ["n2"], "Recorrida de la Chacra Norte 2", 4, { kind: "scouting", priority: "low", pin: true });
  await task("celso", ["p2"], "Reparar el bebedero del Potrero Monte", -5, { priority: "high", checklist: ["Cambiar el flotante", "Probar la cañería"] });
  const [calib] = await task("ramon", ["l1"], "Calibrar la pulverizadora antes de la aplicación", -9, { kind: "application", dueTime: "08:00", checklist: ["Medir caudal de las picos", "Verificar la presión", "Limpiar filtros"] });
  await task("carlos", ["l2"], "Pedir cotización de repuestos de la cosechadora", -3, { priority: "high" });
  await task("lidia", ["l7"], "Controlar emergencia del maíz zafrinha", 6, { kind: "crop_status" });
  await task("ramon", ["n4"], "Revisar encharcamiento en la Chacra Norte 4", 2, { kind: "scouting", pin: true });
  if (!have.has("Monitoreo de chinche en soja")) {
    await o.post(`/org/tasks/${mon}/comments`, { text: "Prioricen el Lote 1: ya está sobre el umbral." });
    await o.post(`/org/tasks/${calib}/comments`, { text: "Se pospuso por la lluvia del martes." });
  }
  // tareas hechas: el empleado las cierra desde su celular con el registro
  const doneDefs = [
    ["ramon", "l2", "Medir lluvia (semana pasada)", 6, "rain", (d) => ({ mm: 14, readAt: at(d, 7, 5) })],
    ["celso", "p1", "Revisar la aguada del Potrero Aguada", 5, "water", () => ({ level: "half", note: "Nivel medio" })],
    ["celso", "p2", "Conteo de hacienda del Potrero Monte", 9, "herd_count", () => ({ counts: { novillo: 58, vaquilla: 19 } })],
    ["lidia", "l5", "Regar el Lote 5", 7, "irrigation", (d) => ({ mm: 10, method: "pivot", appliedAt: at(d, 18) })],
    ["ramon", "n1", "Leer el pluviómetro Norte", 12, "rain", (d) => ({ mm: 9, readAt: at(d, 8, 5) })],
  ];
  const doneTitles = new Set((await o.get("/org/tasks?status=done")).map((x) => x.title));
  for (const [who, pk, title, ago, kind, mk] of doneDefs) {
    if (have.has(title) && doneTitles.has(title)) continue;
    const [tid] = await task(who, [pk], title, ago + 1, { kind });
    const rc = rec(kind, pk, ago, 10, mk(ago), kind === "water" ? { poi: S.pois[pk === "p1" ? "water1" : "water2"].id } : kind === "rain" ? { poi: S.pois[pk === "n1" ? "rain3" : "rain1"].id } : {});
    await push(who, [rc.mutation, { mutationId: uuidv7(), kind: "tasks.status", row: { id: tid, status: "done", completedAt: at(ago, 11), recordId: rc.id } }]);
  }
  log("tareas");
}

// ---------- paso 7: hacienda y sanidad ----------
async function stepLivestock() {
  const o = S.owner, PL = S.plots, P = S.prod;
  const out = [];
  const R = (...a) => out.push(rec(...a));
  const H = (d, k, counts, who) => R("herd_count", k, d, 8, { counts }, who ? { author: who } : {});
  H(82, "p1", { vaca: 84, vaquilla: 28, ternero: 38, toro: 3 }); H(41, "p1", { vaca: 85, vaquilla: 30, ternero: 44, toro: 3 }); H(6, "p1", { vaca: 85, vaquilla: 18, ternero: 49, toro: 3 });
  H(80, "p2", { novillo: 62, vaquilla: 8 }); H(38, "p2", { novillo: 60, vaquilla: 20 }); H(5, "p2", { novillo: 58, vaquilla: 20 });
  H(83, "np", { novillo: 118 }); H(40, "np", { novillo: 120 }); H(4, "np", { novillo: 120 });
  R("herd_move", "p1", 30, 9, { toPlotId: PL.p2.id, counts: { vaquilla: 12 }, reason: "rotacion" });
  R("herd_move", "p2", 33, 9, { counts: { novillo: 2 }, reason: "venta", note: "Venta de dos novillos de descarte" });
  R("mortality", "p1", 21, 11, { category: "ternero", head: 1, cause: "vibora", note: "Encontrado en el bajo" });
  R("mortality", "p2", 47, 11, { category: "novillo", head: 1, cause: "enfermedad" });
  const hl = (d, k, reason, prod, pk, qty, counts, dose) => R("health", k, d, 9, { reason, product: prod.name, productId: prod.id, quantity: qty, dose, counts });
  hl(41, "p1", "aftosa", P.aftosa, "aftosa", 9, { vaca: 85, vaquilla: 30, ternero: 44, toro: 3 }, "2 ml por cabeza");
  hl(40, "p2", "aftosa", P.aftosa, "aftosa", 8, { novillo: 60, vaquilla: 20 }, "2 ml por cabeza");
  hl(39, "np", "aftosa", P.aftosa, "aftosa", 4, { novillo: 120 }, "2 ml por cabeza");
  hl(70, "p1", "brucelosis", P.aftosa, "aftosa", 1, { vaquilla: 28 }, "2 ml por cabeza");
  hl(28, "p2", "desparasitacion", P.ivermec, "ivermec", 4, { novillo: 60, vaquilla: 20 }, "1 ml cada 50 kg");
  hl(26, "np", "desparasitacion", P.ivermec, "ivermec", 5, { novillo: 120 }, "1 ml cada 50 kg");
  for (const [d, k, t, kg] of [[75, "p1", "sal_mineral", 120], [58, "p1", "sal_mineral", 120], [44, "p2", "sal_proteinada", 200], [31, "p1", "sal_mineral", 110], [17, "p2", "balanceado", 240], [8, "p1", "sal_mineral", 130], [3, "p2", "sal_proteinada", 180]]) R("supplement", k, d, 10, { type: t, kg, ...(t !== "sal_mineral" ? { product: t === "balanceado" ? "Balanceado 18 % PB" : "Sal proteinada" } : {}) });
  // pesadas por grupo y por caravana
  const grp = [[60, 322], [45, 341], [30, 360], [15, 379], [3, 396]];
  for (const [d, kg] of grp) R("weighing", "np", d, 9, { kg: kg + Math.floor(between(-3, 3)), head: 118, group: "Novillos del corral", category: "novillo" });
  for (const [d, kg] of [[70, 248], [35, 268], [6, 291]]) R("weighing", "p1", d, 9, { kg, head: 30, group: "Vaquillas", category: "vaquilla" });
  S.animals = [];
  for (let i = 0; i < 10; i++) {
    const tag = `PY-${1041 + i}`;
    const sex = i < 7 ? "hembra" : "macho";
    const a = await o.post(`/org/farms/${S.farms[1].id}/animals`, { tag, category: i < 5 ? "vaca" : i < 7 ? "vaquilla" : "novillo", sex, birthDate: dayStr(365 * (i < 5 ? 5 : 2) + i * 17), note: i === 0 ? "Madre de la mejor cría" : undefined });
    S.animals.push({ ...a, tag });
    if (i >= 5) for (const [d, kg] of [[63, 250 + i * 6], [33, 282 + i * 6], [4, 316 + i * 6]]) R("weighing", "p1", d, 9, { kg, head: 1, tag, category: i < 7 ? "vaquilla" : "novillo" });
  }
  R("reproduction", "p1", 70, 8, { event: "service", head: 55, method: "natural" });
  R("reproduction", "p1", 24, 8, { event: "pregnancy_check", head: 55, pregnant: 43 });
  R("reproduction", "p1", 12, 8, { event: "calving", head: 6, calves: 6 });
  R("reproduction", "p1", 5, 8, { event: "weaning", head: 14, calves: 14 });
  R("reproduction", "p1", 50, 8, { event: "service", head: 1, method: "ia", tag: "PY-1042" });
  R("reproduction", "p1", 18, 8, { event: "pregnancy_check", head: 1, pregnant: 1, tag: "PY-1042" });
  for (const [d, k, lvl] of [[30, "p1", "full"], [18, "p1", "half"], [7, "p1", "half"], [28, "p2", "half"], [14, "p2", "low"], [2, "p2", "low"], [9, "np", "full"], [1, "np", "full"]]) R("water", k, d, 8, { level: lvl }, { poi: S.pois[k === "p1" ? "water1" : k === "p2" ? "water2" : "water3"].id });
  for (const [d, k, h, c] of [[40, "p1", 22, "medium"], [20, "p1", 18, "medium"], [6, "p1", 14, "low"], [24, "p2", 30, "high"], [5, "p2", 26, "high"]]) R("pasture_status", k, d, 9, { heightCm: h, cover: c, livestockPresent: true });
  await pushRecords(out);
  log(`${out.length} registros de hacienda y animales`);
}

async function stepFeed() {
  const o = S.owner, P = S.prod, out = [];
  const R = (...a) => out.push(rec(...a));
  // feedlot: raciones suministradas al corral (las carga la oficina: dueño o administrador)
  for (let i = 0; i < 16; i++) {
    const d = 20 - i, kgDm = round(1650 + i * 32 + between(-40, 40)), asFed = (pct, dm) => round((kgDm * pct) / 100 / (dm / 100));
    R("feed", "np", d, 7, { rationId: S.rations.term, ration: "Terminación 70/30", kgDm, head: 120, items: [{ productId: P.maizG.id, name: P.maizG.name, kg: asFed(62, 88) }, { productId: P.expeller.id, name: P.expeller.name, kg: asFed(14, 90) }, { productId: P.silaje.id, name: P.silaje.name, kg: asFed(21, 35) }, { productId: P.nucleo.id, name: P.nucleo.name, kg: asFed(3, 98) }] }, { author: "owner" });
  }
  await pushRecords(out);
  log(`${out.length} suministros de ración`);
}

async function stepSanitary() {
  const o = S.owner;
  // calendario sanitario (G-10)
  const E = (reason, plannedDate, categories, product, extra = {}) => o.post("/org/sanitary-events", { reason, plannedDate, farmId: S.farms[1].id, categories, product, createTasks: false, ...extra });
  await E("aftosa", dayStr(41), ["vaca", "vaquilla", "novillo", "ternero", "toro"], "Vacuna antiaftosa");
  await E("brucelosis", dayStr(70), ["vaquilla"], "Vacuna B19");
  await E("desparasitacion", dayStr(28), ["novillo", "vaquilla"], "Ivermectina 1 %");
  await E("garrapata", dayStr(12), ["vaca", "toro"], "Garrapaticida Cypermil", { note: "Baño por aspersión en la manga" });
  await E("aftosa", dayStr(-24), ["vaca", "vaquilla", "novillo", "ternero", "toro"], "Vacuna antiaftosa", { createTasks: true, note: "Segunda campaña del año" });
  await E("brucelosis", dayStr(-44), ["vaquilla"], "Vacuna B19", { createTasks: true });
  await E("desparasitacion", dayStr(-62), ["novillo"], "Ivermectina 1 %");
  log("calendario sanitario");
}

// ---------- paso 8: ERP, dinero (stock, costos, granos, hacienda, caja, personal, presupuesto, contador) ----------
async function stepErpMoney() {
  const o = S.owner, e = (p) => `/org/erp/${p}`, P = S.prod, PL = S.plots, W = S.wh, Y = S.party, F1 = S.farms[1].id;
  const crops = Object.keys(PL).filter((k) => PL[k].kind === "crop");
  // semilla sembrada: consumo directo por lote (descuenta stock y carga costo al lote)
  const seedKey = { soja: ["sSoja", 55], maiz: ["sMaiz", 20], girasol: ["sGira", 6], trigo: ["sTrigo", 110] };
  for (const k of crops.filter((x) => PL[x].farm === 1)) {
    const [pk, perHa] = seedKey[PL[k].crop];
    await o.post(e("stock/consumptions"), { productId: P[pk].id, warehouseId: PL[k].farm === 1 ? W.insumos : W.norte, date: dayStr(PL[k].sow), qty: round(perHa * PL[k].areaHa, 1), plotId: PL[k].id, seasonId: S.seasons.cur, note: "Semilla sembrada" }).catch((er) => log("semilla:", er.message.slice(0, 140)));
  }
  await o.post(e("stock/adjustments"), { productId: P.glifo.id, warehouseId: W.insumos, date: dayStr(14), qty: -18, note: "Derrame al descargar el tambor" });
  await o.post(e("stock/adjustments"), { productId: P.sal.id, warehouseId: W.insumos, date: dayStr(10), qty: 40, note: "Diferencia de inventario" });
  await o.post(e("stock/transfers"), { productId: P.gasoil.id, fromWarehouseId: W.tanque, toWarehouseId: W.insumos, date: dayStr(8), qty: 500, note: "Gasoil para el generador del casco" }).catch((er) => log("transferencia:", er.message.slice(0, 120)));
  const stock = await o.get(e("stock"));
  S.stock = stock;
  const rows = Array.isArray(stock) ? stock : stock.rows ?? stock.items ?? [];
  let i = 0;
  for (const r of rows) {
    const qty = r.qty ?? r.balance ?? r.stock ?? 0;
    if (!r.productId || !r.warehouseId || qty <= 0) continue;
    const faltante = i++ % 4 === 0; // uno de cada cuatro queda por debajo del mínimo
    await o.put(e("stock/minimums"), { productId: r.productId, warehouseId: r.warehouseId, minQty: faltante ? Math.ceil(qty * 1.6) : Math.floor(qty * 0.3) });
  }
  // costos sueltos y de la campaña cerrada
  const cost = (d) => o.post(e("costs"), { currency: "PYG", ...d });
  const perHa = { soja: { input: 1_650_000, fuel: 380_000, contractor: 520_000, labor: 140_000 }, maiz: { input: 2_900_000, fuel: 520_000, contractor: 650_000, labor: 180_000 }, trigo: { input: 1_400_000, fuel: 300_000, contractor: 480_000, labor: 120_000 } };
  for (const [k, [crop]] of Object.entries(S.oldPlan)) {
    const p = PL[k], q = perHa[crop];
    for (const [cat, act] of [["input", "agricultura"], ["fuel", "agricultura"], ["contractor", "agricultura"], ["labor", "agricultura"]])
      await cost({ date: dayStr(crop === "trigo" ? 230 : crop === "maiz" ? 270 : 280), farmId: p.farmId, plotId: p.id, seasonId: S.seasons.old, activity: act, category: cat, amount: Math.round(q[cat] * p.areaHa), description: { input: "Semillas, fertilizantes y agroquímicos", fuel: "Combustible de labores", contractor: "Cosecha y flete", labor: "Jornales" }[cat] });
  }
  await cost({ date: dayStr(60), farmId: F1, seasonId: S.seasons.cur, activity: "administracion", category: "other", amount: 12_000_000, description: "Honorarios de asesoría agronómica" });
  await cost({ date: dayStr(75), farmId: F1, seasonId: S.seasons.cur, activity: "agricultura", category: "other", amount: 18_500_000, description: "Seguro agrícola de la zafra" });
  await cost({ date: dayStr(20), farmId: F1, activity: "administracion", category: "other", amount: 3_240_000, description: "Energía eléctrica ANDE" });
  await cost({ date: dayStr(33), farmId: F1, activity: "ganaderia", category: "other", amount: 4_850_000, description: "Honorarios veterinarios" });
  await cost({ date: dayStr(12), farmId: F1, activity: "ganaderia", category: "contractor", amount: 6_200_000, description: "Flete de hacienda a la feria" });
  await cost({ date: dayStr(45), farmId: S.farms[2].id, seasonId: S.seasons.cur, activity: "agricultura", category: "contractor", amount: 9_800_000, description: "Aplicación aérea de herbicida", currency: "PYG" });
  // venta de granos (E-34)
  const oldSoy = crops.filter((k) => S.oldPlan[k]?.[0] === "soja"), oldMaiz = crops.filter((k) => S.oldPlan[k]?.[0] === "maiz"), oldTrigo = crops.filter((k) => S.oldPlan[k]?.[0] === "trigo");
  const sum = (ks) => round(ks.reduce((a, k) => a + S.oldHarvest[k].tons, 0), 1);
  const contract = async (d) => (await o.post(e("grain-contracts"), d)).id;
  const cSoy = await contract({ partyId: Y.adm, number: "ADM-2026-0412", crop: "soja", seasonId: S.seasons.old, tons: Math.ceil(sum(oldSoy)) + 20, priceMinor: 31_800, currency: "USD", deliveryFrom: "2026-02-15", deliveryTo: "2026-05-30", note: "Precio fijado en USD por tonelada, entrega en Villeta" });
  const cMaiz = await contract({ partyId: Y.coop, number: "CCU-0188", crop: "maiz", seasonId: S.seasons.old, tons: Math.ceil(sum(oldMaiz)) + 10, priceMinor: 1_020_000, currency: "PYG", deliveryFrom: "2026-03-01", deliveryTo: "2026-06-15" });
  const cTri = await contract({ partyId: Y.coop, number: "CCU-0231", crop: "trigo", seasonId: S.seasons.old, tons: Math.ceil(sum(oldTrigo)) + 5, priceMinor: 2_050_000, currency: "PYG", deliveryFrom: "2025-11-01", deliveryTo: "2025-12-20" });
  await contract({ partyId: Y.cargill, number: "CPA-26-77120", crop: "soja", seasonId: S.seasons.cur, tons: 900, priceMinor: 34_500, currency: "USD", deliveryFrom: "2027-03-01", deliveryTo: "2027-04-30", note: "Venta anticipada, precio fijo" });
  const curTri = round(PL.l3.areaHa * 3.15, 1);
  const cTriCur = await contract({ partyId: Y.coop, number: "CCU-0302", crop: "trigo", seasonId: S.seasons.cur, tons: Math.ceil(curTri) + 4, priceMinor: 2_150_000, currency: "PYG", deliveryFrom: dayStr(25), deliveryTo: dayStr(-10) });
  S.settlements = [];
  let n = 1;
  for (const [cid, ks, price, base, cur] of [[cSoy, oldSoy, 31_800, 235, "USD"], [cMaiz, oldMaiz, 1_020_000, 190, "PYG"], [cTri, oldTrigo, 2_050_000, 330, "PYG"]]) {
    for (const k of ks) {
      const t = S.oldHarvest[k].tons, p = PL[k], date = dayStr(base - Math.floor(rnd() * 12));
      await o.post(e("grain-deliveries"), { contractId: cid, date, tons: t, farmId: p.farmId, plotId: p.id, ticket: `T-${4100 + n}`, destination: cid === cSoy ? "ADM Villeta" : "Cooperativa Colonias Unidas", moisturePct: 13 });
      const r = await o.post(e("grain-settlements"), { contractId: cid, number: `LQ-${2600 + n}`, date, tons: t, priceMinor: price, deductionsMinor: Math.round(t * price * 0.012), farmId: p.farmId, plotId: p.id, dueDate: dayStr(base - 12 - 15 - (n === 3 ? 40 : 0)) });
      S.settlements.push({ id: r.id, cur, k });
      n++;
    }
  }
  const half = round(curTri * 0.6, 1);
  await o.post(e("grain-deliveries"), { contractId: cTriCur, date: dayStr(15), tons: half, farmId: F1, plotId: PL.l3.id, ticket: "T-4602", destination: "Cooperativa Colonias Unidas", moisturePct: 12.5 });
  await o.post(e("grain-deliveries"), { contractId: cTriCur, date: dayStr(12), tons: round(curTri - half, 1), farmId: F1, plotId: PL.l3.id, ticket: "T-4611", destination: "Cooperativa Colonias Unidas", moisturePct: 12.8 });
  const rs = await o.post(e("grain-settlements"), { contractId: cTriCur, number: "LQ-2644", date: dayStr(10), tons: half, priceMinor: 2_150_000, deductionsMinor: 2_300_000, farmId: F1, plotId: PL.l3.id, dueDate: dayStr(-12) });
  S.settlementOpen = rs.id;
  // hacienda: compras y ventas (E-35)
  const deal = (d) => o.post(e("cattle-deals"), { currency: "PYG", farmId: F1, seasonId: S.seasons.cur, ...d });
  await deal({ kind: "buy", date: dayStr(64), partyId: Y.cabana, category: "Novillos de recría", heads: 60, totalKg: 15_600, amount: 210_600_000, guideNumber: "GT-2026-8821", dueDate: dayStr(34) });
  await deal({ kind: "sell", date: dayStr(22), partyId: Y.frigo, category: "Novillos gordos", heads: 35, totalKg: 17_150, amount: 253_820_000, guideNumber: "GT-2026-9302", dueDate: dayStr(-10) });
  await deal({ kind: "sell", date: dayStr(118), partyId: Y.frigo, category: "Vacas de descarte", heads: 28, totalKg: 12_880, amount: 164_864_000, guideNumber: "GT-2026-7011", dueDate: dayStr(103) });
  // caja y bancos (E-36)
  S.cash = {};
  const acc = async (k, d) => (S.cash[k] = (await o.post(e("cash-accounts"), d)).id);
  await acc("caja", { name: "Caja chica", type: "cash", currency: "PYG", openingBalance: 8_000_000 });
  await acc("itau", { name: "Banco Itaú · Cuenta corriente", type: "bank", currency: "PYG", openingBalance: 420_000_000, note: "Cuenta principal de la estancia" });
  await acc("usd", { name: "Banco Continental · Dólares", type: "bank", currency: "USD", openingBalance: 3_500_000 });
  const mv = (account, ago, amount, description, partyId) => o.post(e("cash/moves"), { accountId: S.cash[account], date: dayStr(ago), amount, description, partyId });
  await mv("caja", 55, -450_000, "Viáticos y combustible de la camioneta"); await mv("caja", 31, -230_000, "Ferretería: alambre y grampas", Y.repuestos); await mv("caja", 9, -310_000, "Almuerzo de cosecha");
  await mv("itau", 48, -3_240_000, "Pago de energía eléctrica ANDE"); await mv("itau", 33, -12_000_000, "Honorarios de asesoría agronómica"); await mv("itau", 14, -6_200_000, "Flete de hacienda", Y.frigo);
  await mv("usd", 40, 450_000, "Cobro de liquidación en dólares", Y.adm);
  await o.post(e("cash/transfers"), { fromAccountId: S.cash.itau, toAccountId: S.cash.caja, date: dayStr(28), amount: 5_000_000, description: "Reposición de caja chica" });
  log("stock, costos, granos, hacienda y cuentas");
}

async function stepErpMoney2() {
  const o = S.owner, e = (p) => `/org/erp/${p}`, PL = S.plots;
  const crops = Object.keys(PL).filter((k) => PL[k].kind === "crop");
  const accounts = await o.get(e("cash-accounts"));
  S.cash = { caja: accounts.find((a) => a.type === "cash").id, itau: accounts.find((a) => a.currency === "PYG" && a.type === "bank").id, usd: accounts.find((a) => a.currency === "USD").id };
  const paid = (key, account, ago) => S.purchases[key] && o.get(e(`purchases/${S.purchases[key].id}`)).then((d) => {
    const amount = d.totalAmount;
    return o.post(e("cash/settle"), { docKind: "purchase", docId: S.purchases[key].id, accountId: S.cash[account], date: dayStr(ago), amount, description: "Pago de factura" });
  });
  await paid("semillas", "itau", 80); await paid("agro", "usd", 34); await paid("ferti", "itau", 49); await paid("norte", "usd", 19); await paid("norte-pyg", "itau", 39); await paid("gasoil", "itau", 62);
  for (const st of (await o.get(e("grain-settlements"))).filter((x) => x.number !== "LQ-2644" && x.paidAmount === 0)) {
    await o.post(e("cash/settle"), { docKind: "settlement", docId: st.id, accountId: S.cash[st.currency === "USD" ? "usd" : "itau"], date: dayStr(st.number === "LQ-2603" ? 25 : 90), amount: st.netAmount, description: "Cobro de liquidación" }).catch((er) => log("cobro:", er.message.slice(0, 120)));
  }
  // personal: asistencia de los últimos 60 días, adelantos y pagos
  const emps = Object.keys(S.emp);
  const labors = ["Siembra y labores", "Pulverización", "Mantenimiento de maquinaria", "Manejo de hacienda", "Alambrados", "Cosecha"];
  for (let d = 60; d >= 1; d--) {
    const dow = new Date(NOW - d * DAY).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const todays = emps.filter(() => rnd() < 0.75);
    if (!todays.length) continue;
    await o.post(e("attendance"), { date: dayStr(d), entries: todays.map((k) => { const pk = pick(crops); return { employeeId: S.emp[k], days: rnd() < 0.9 ? 1 : 0.5, farmId: PL[pk].farmId, plotId: PL[pk].id, seasonId: S.seasons.cur, labor: pick(labors) }; }) });
  }
  for (const k of emps) {
    await o.post(e("employee-payments"), { employeeId: S.emp[k], date: dayStr(38), kind: "advance", amountPyg: 400_000, note: "Adelanto de quincena" });
    await o.post(e("employee-payments"), { employeeId: S.emp[k], date: dayStr(22), kind: "payment", amountPyg: 1_900_000, note: "Pago del mes anterior" });
  }
  // presupuesto de la campaña en curso (E-32)
  const bl = (d) => o.post(e("budget-lines"), { seasonId: S.seasons.cur, ...d });
  for (const [crop, input, fuel, contractor, labor] of [["soja", 240_000_000, 42_000_000, 68_000_000, 26_000_000], ["maiz", 130_000_000, 24_000_000, 38_000_000, 14_000_000], ["girasol", 34_000_000, 7_000_000, 9_000_000, 4_000_000], ["trigo", 46_000_000, 9_000_000, 14_000_000, 5_000_000]]) {
    await bl({ crop, activity: "agricultura", category: "input", amountPyg: input }); await bl({ crop, activity: "agricultura", category: "fuel", amountPyg: fuel });
    await bl({ crop, activity: "agricultura", category: "contractor", amountPyg: contractor }); await bl({ crop, activity: "agricultura", category: "labor", amountPyg: labor });
  }
  await bl({ activity: "ganaderia", category: "other", amountPyg: 30_000_000, note: "Sanidad y suplementación" }); await bl({ activity: "administracion", category: "other", amountPyg: 40_000_000, note: "Asesoría, energía y seguros" });
  await bl({ plotId: PL.l1.id, category: "input", amountPyg: 48_000_000, note: "Insumos del Lote 1" });
  // contador y sistemas contables (E-38, I-06)
  await o.put(e("accountant/map/input"), { code: "5.1.01", name: "Insumos agrícolas" }); await o.put(e("accountant/map/labor"), { code: "5.2.01", name: "Sueldos y jornales del personal" }); await o.put(e("accountant/map/sale"), { code: "4.1.01", name: "Ventas de granos y hacienda" });
  await o.post(e("export/formats"), { name: "Libro IVA compras", dataset: "purchases", config: libroIvaConfig("purchases") });
  await o.post(e("export/formats"), { name: "Libro IVA ventas", dataset: "sales", config: libroIvaConfig("sales") });
  log("stock, costos, granos, hacienda, caja, personal, presupuesto y contador");
}

// ---------- paso 9: agronomía (suelo, entregas a acopio, mapas de rinde, recetas) ----------
async function stepAgri() {
  const o = S.owner, PL = S.plots, P = S.prod;
  const F1 = S.farms[1].id, F2 = S.farms[2].id;
  const soil = [["l1", 6.1, 18, 0.42, 3.2], ["l2", 5.8, 22, 0.38, 3.6], ["l3", 6.4, 14, 0.30, 2.9], ["l4", 5.6, 11, 0.25, 2.7], ["l5", 6.0, 19, 0.40, 3.4], ["l6", 5.5, 9, 0.22, 2.5], ["l7", 6.2, 16, 0.35, 3.0], ["l1", 5.9, 20, 0.45, 3.5], ["l4", 5.7, 12, 0.28, 2.8], ["l6", 5.4, 10, 0.24, 2.6]];
  for (const [i, [k, ph, pm, kc, om]] of soil.entries()) {
    const c = centerOfRing(PL[k].ring);
    await o.post(`/org/farms/${F1}/soil-samples`, { plotId: PL[k].id, pointLabel: `Punto ${i + 1}`, lon: jitter(c.lon, 0.0006), lat: jitter(c.lat, 0.0004), sampledOn: dayStr(120 - i * 3), depthCm: 20, lab: "Laboratorio de suelos UNA", ph, pMgKg: pm, kCmolKg: kc, omPct: om, note: i === 0 ? "Muestra compuesta de 15 submuestras" : undefined });
  }
  for (const [i, [k, ph, pm, kc, om]] of [["n1", 6.0, 17, 0.4, 3.1], ["n2", 5.9, 20, 0.36, 3.3], ["n4", 5.5, 10, 0.26, 2.6]].entries()) await o.post(`/org/farms/${F2}/soil-samples`, { plotId: PL[k].id, pointLabel: `Norte ${i + 1}`, sampledOn: dayStr(100 - i * 5), depthCm: 20, lab: "Laboratorio de suelos UNA", ph, pMgKg: pm, kCmolKg: kc, omPct: om });
  // entregas a acopio con descuentos de balanza (A-23)
  const del = (k, ago, kg, moist, base, imp, silo, crop = PL[k].crop, seasonId = S.seasons.cur) => o.post(`/org/farms/${PL[k].farmId}/deliveries`, { plotId: PL[k].id, seasonId, crop, ticket: `B-${7000 + Math.floor(rnd() * 999)}`, silo, deliveredOn: dayStr(ago), grossKg: kg, moisturePct: moist, baseMoisturePct: base, impuritiesPct: imp, otherKg: 0 });
  for (const [ago, kg, m] of [[16, 30_200, 13.4], [16, 31_850, 12.8], [15, 29_900, 13.1], [14, 32_400, 12.6]]) await del("l3", ago, kg, m, 13, 1.2, "Cooperativa Colonias Unidas");
  for (const [k, ago, kg, m] of [["l2", 255, 29_700, 16.1], ["l2", 254, 30_500, 15.4], ["l4", 252, 31_000, 15.8], ["l1", 251, 28_900, 14.6]]) await del(k, ago, kg, m, 14, 1.5, "ADM Villeta", "maiz", S.seasons.old);
  // mapas de rinde de la campaña anterior (A-24)
  for (const k of ["l4", "l1"]) {
    const ring = PL[k].ring, bb = ring.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [999, 999, -999, -999]);
    const cells = [], ctr = centerOfRing(ring);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) { const lon = round(bb[0] + ((i + 0.5) / 9) * (bb[2] - bb[0]), 6), lat = round(bb[1] + ((j + 0.5) / 7) * (bb[3] - bb[1]), 6); const y = round(9.1 + Math.sin(i / 2) * 1.4 + Math.cos(j / 1.5) * 0.9 + between(-0.4, 0.4), 2); cells.push([lon, lat, y, 12]); }
    const ys = cells.map((c) => c[2]).sort((a, b) => a - b), mean = round(ys.reduce((a, b) => a + b, 0) / ys.length, 2);
    await o.post(`/org/plots/${PL[k].id}/yield-maps`, { seasonId: S.seasons.old, fileName: `rinde-${PL[k].name.replace(/\W+/g, "-").toLowerCase()}-2026.csv`, nPoints: 4120, nDropped: 96, meanTHa: mean, p10THa: ys[Math.floor(ys.length * 0.1)], p90THa: ys[Math.floor(ys.length * 0.9)], minTHa: ys[0], maxTHa: ys.at(-1), cvPct: 14.2, cellM: 30, cells });
  }
  // recetas del agrónomo (A-11)
  const rx = (plotKeys, who, due, products, note) => o.post("/org/prescriptions", { farmId: PL[plotKeys[0]].farmId, plotIds: plotKeys.map((k) => PL[k].id), assigneeId: S.team[who].userId, dueDate: dayStr(due), prescription: { seasonId: S.seasons.cur, products, volumeLHa: 80, note } });
  await rx(["l1", "l6"], "ramon", -1, [{ productId: P.engeo.id, name: P.engeo.name, dose: 0.25, unit: "l_ha" }, { productId: P.glifo.id, name: P.glifo.name, dose: 1.5, unit: "l_ha" }], "Aplicar con viento menor a 12 km/h");
  await rx(["n4"], "ramon", 2, [{ productId: P.fungi.id, name: P.fungi.name, dose: 0.4, unit: "l_ha" }], "Preventivo antes de R3");
  log("suelo, entregas, mapas de rinde y recetas");
}

// ---------- paso 10: integraciones y cuenta ----------
async function stepIntegrations() {
  const o = S.owner;
  S.token = (await o.post("/org/api-tokens", { name: "Tablero de Power BI" })).token;
  await o.post("/org/api-tokens", { name: "Integración con el contador" });
  S.hook = await o.post("/org/webhooks", { url: "https://hooks.sanpedro.example/yvy", events: ["alert.created", "record.created"] }).catch((e) => { log("webhook:", e.message.slice(0, 160)); return null; });
  S.share = await o.post(`/org/farms/${S.farms[1].id}/share-links`, { days: 30 });
  await o.post("/org/report-schedules", { farmId: S.farms[1].id, name: "Parte semanal para el dueño de la tierra", email: "familia.baez@sanpedro.test", frequency: "weekly" });
  await o.post("/org/report-schedules", { farmId: null, name: "Resumen mensual para el banco", email: "oficial.credito@banco.test", frequency: "monthly" });
  S.feed = await o.post("/me/calendar-feed", {}).catch((e) => { log("calendario:", e.message.slice(0, 120)); return null; });
  await o.put("/org/security", { requireAdminTotp: false }).catch(() => {});
  log("token de API, webhook, enlace de solo lectura, informes programados");
}

// ---------- paso 11: lo que en producción llega de jobs externos (/ingest firmado) ----------
// Se arma el mismo payload que los jobs de workers-py; los valores son sintéticos pero coherentes con los registros cargados.
const doyOf = (ms) => Math.floor((Date.UTC(new Date(ms - 3 * 3.6e6).getUTCFullYear(), new Date(ms - 3 * 3.6e6).getUTCMonth(), new Date(ms - 3 * 3.6e6).getUTCDate()) - Date.UTC(new Date(ms - 3 * 3.6e6).getUTCFullYear(), 0, 0)) / DAY);
const ndviOf = (p, d) => {
  const age = p.sow ? p.sow - d : null;
  const noise = between(-0.025, 0.025);
  if (p.kind === "pasture") return round(Math.min(0.8, Math.max(0.3, 0.62 + 0.07 * Math.sin(d / 9) + noise)), 3);
  if (age < 0) return round(0.2 + 0.05 * Math.sin(d / 6) + noise, 3);
  const peakAge = p.crop === "trigo" ? 80 : 72, fall = p.crop === "trigo" ? 105 : 120;
  const up = 0.2 + 0.66 * (1 - Math.exp(-age / (p.crop === "trigo" ? 30 : 24)));
  const v = age <= peakAge ? up : Math.max(0.28, up - (age - peakAge) / (fall - peakAge) * 0.5);
  return round(Math.min(0.9, Math.max(0.12, v + noise)), 3);
};
async function stepIngest() {
  const PL = S.plots, F1 = S.farms[1].id, F2 = S.farms[2].id;
  const plotList = Object.values(PL);
  // escenas Sentinel-2 y estadísticas de índices por lote (curva de vigor de la campaña)
  const rows = [];
  const lastScene = {};
  for (let d = 140; d >= 2; d -= 5) {
    if (rnd() < 0.18) continue; // día con nubes: sin escena útil
    const acquiredAt = at(d, 13, 40);
    const sc = await ingest("POST", "/ingest/scenes", { source: "sentinel-2", itemId: `S2B_21JXK_${dayStr(d).replaceAll("-", "")}_0_L2A`, acquiredAt, cloudPct: round(between(0, 22), 1) });
    const sceneId = sc.id ?? sc.sceneId ?? String(sc);
    lastScene.id = sceneId; lastScene.at = acquiredAt;
    for (const p of plotList) {
      const v = ndviOf(p, d);
      rows.push({ plotId: p.id, sceneId, acquiredAt, idx: "ndvi", mean: v, p10: round(v - 0.07, 3), p90: round(Math.min(0.95, v + 0.06), 3), validPct: round(between(88, 100), 1), lowConfidence: false });
      rows.push({ plotId: p.id, sceneId, acquiredAt, idx: "ndmi", mean: round(0.1 + v * 0.45 + between(-0.03, 0.03), 3), p10: round(v * 0.45 - 0.02, 3), p90: round(v * 0.45 + 0.2, 3), validPct: round(between(88, 100), 1), lowConfidence: false });
    }
    await ingest("POST", `/ingest/scenes/${sceneId}/processed`).catch(() => {});
  }
  for (const part of chunks(rows, 40)) await ingest("POST", "/ingest/plot-index-stats", { rows: part });
  // lluvia CHIRPS y temperatura NASA POWER por estancia, y climatología 1991-2020
  const rainByDay = new Map(RAIN.map(([d, mm]) => [d, mm]));
  for (const farmId of [F1, F2]) {
    const climate = [];
    for (let d = 150; d >= 1; d--) {
      const mm = rainByDay.get(d) ?? (rnd() < 0.05 ? round(between(1, 4), 1) : 0);
      const date = dayStr(d), month = Number(date.slice(5, 7));
      const t = month >= 11 ? 18 : month >= 9 ? 14 : month >= 6 ? 8 : 10;
      climate.push({ farmId, plotId: "", date, source: d <= 11 ? "chirps_prelim" : "chirps", precipMm: round(mm * (farmId === F2 ? between(0.85, 1.15) : 1), 1) });
      climate.push({ farmId, plotId: "", date, source: "nasa_power", tminC: round(t + between(-3, 4) + (d < 40 ? 4 : 0), 1), tmaxC: round(t + 13 + between(-4, 5) + (d < 40 ? 5 : 0), 1), soilMoisture0_7: round(between(0.28, 0.42), 3), soilMoisture7_28: round(between(0.3, 0.4), 3) });
    }
    for (const part of chunks(climate, 40)) await ingest("POST", "/ingest/climate-daily", { rows: part });
    const clim = [];
    for (let d = 180; d >= -25; d--) {
      const doy = doyOf(NOW - d * DAY), month = Number(dayStr(d).slice(5, 7)), wet = [10, 11, 12, 1, 2, 3].includes(month);
      const mean = wet ? 4.4 : 2.6;
      clim.push({ farmId, plotId: "", dayOfYear: doy, variable: "precip", p20: round(mean * 0.25, 2), p50: round(mean * 0.7, 2), p80: round(mean * 1.7, 2), mean: round(mean, 2) });
      const tm = month >= 11 || month <= 3 ? 19 : month >= 9 ? 14 : 9;
      clim.push({ farmId, plotId: "", dayOfYear: doy, variable: "tmin", p20: tm - 3, p50: tm, p80: tm + 3, mean: tm });
      clim.push({ farmId, plotId: "", dayOfYear: doy, variable: "soil_top", p20: 0.26, p50: 0.33, p80: 0.4, mean: 0.33 });
      clim.push({ farmId, plotId: "", dayOfYear: doy, variable: "soil_root", p20: 0.27, p50: 0.34, p80: 0.41, mean: 0.34 });
    }
    const seen = new Set();
    for (const part of chunks(clim.filter((r) => !seen.has(`${r.dayOfYear}${r.variable}`) && seen.add(`${r.dayOfYear}${r.variable}`)), 40)) await ingest("POST", "/ingest/climatology", { rows: part });
  }
  // informe de riesgo climático (job risk_report) y SPI
  const monthly = [168, 132, 140, 148, 118, 96, 72, 58, 110, 160, 172, 180];
  for (const farmId of [F1, F2]) {
    await ingest("POST", "/ingest/farm-risk", { farmId, report: {
      version: 1, generatedAt: NOW, normalFrom: 1991, normalTo: 2020,
      frost: { thresholdC: 2, perYear: Array.from({ length: 10 }, (_, i) => ({ year: 2016 + i, days: [4, 9, 2, 6, 11, 3, 5, 8, 1, 7][i] })), meanPerYear: 5.6, worst: { year: 2020, days: 11 }, yearsWithFrostPct: 93, typicalFirstFrost: "06-02", typicalLastFrost: "08-24" },
      rain: { annualMeanMm: monthly.reduce((a, b) => a + b, 0), normal: monthly.map((m, i) => ({ month: i + 1, meanMm: m, p20Mm: Math.round(m * 0.55), p80Mm: Math.round(m * 1.4) })), recent: Array.from({ length: 12 }, (_, i) => { const d = new Date(NOW - (11 - i) * 30 * DAY); return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, mm: Math.round(monthly[d.getUTCMonth()] * between(0.6, 1.3)) }; }) },
      dry: { thresholdMm: 1, meanLongestDays: 16, worst: { year: 2022, days: 41 }, spells15PerYear: 1.8, summerMeanLongestDays: 11 },
      fire: { radiusKm: 10, years: 5, total: 83, perYear: [0, 1, 2, 3, 4].map((i) => ({ from: `${2021 + i}-07-01`, to: `${2022 + i}-06-30`, count: [21, 17, 14, 19, 12][i] })), byMonth: [2, 1, 1, 3, 4, 6, 9, 14, 22, 12, 6, 3], nearestKm: 3.1, lastAt: at(9, 14), source: "NASA FIRMS (VIIRS)" },
    } });
    await ingest("POST", "/ingest/farm-spi", { farmId, report: { version: 1, generatedAt: NOW, throughMonth: dayStr(15).slice(0, 7), referenceFrom: 1991, referenceTo: 2020, scales: [{ scale: 1, spi: -0.4, mm: 118, normalMm: 134, reason: null }, { scale: 3, spi: 0.3, mm: 372, normalMm: 350, reason: null }, { scale: 6, spi: -1.1, mm: 590, normalMm: 700, reason: null }] } });
  }
  // aviso de fuego (FIRMS)
  const fc = centerOfRing(FARM_RING);
  await ingest("POST", "/ingest/fire-alerts", { farmId: F1, date: TODAY, severity: "warning", minDistanceKm: 3.1, windTowardsFarm: true, hotspots: [{ lon: round(fc.lon + 0.032, 5), lat: round(fc.lat + 0.01, 5), acquiredAt: at(0, 3, 12), confidence: "high", frp: 14.2, source: "VIIRS_SNPP_NRT" }, { lon: round(fc.lon + 0.034, 5), lat: round(fc.lat + 0.011, 5), acquiredAt: at(0, 3, 12), confidence: "nominal", frp: 6.8, source: "VIIRS_SNPP_NRT" }] });
  // áreas problema, indicador EUDR, cobertura y área quemada
  const small = (k, dx, dy, w = 0.0007) => { const c = centerOfRing(PL[k].ring); const x = c.lon + dx, y = c.lat + dy; return { type: "Polygon", coordinates: [[[x, y], [x + w, y], [x + w, y + w * 0.8], [x, y + w * 0.8], [x, y]]] }; };
  for (const [k, dx, dy, mean] of [["l1", 0.0004, 0.0003, 0.41], ["l4", -0.0008, 0.0002, 0.38], ["n4", 0.001, -0.0004, 0.35], ["l6", -0.0003, -0.0002, 0.44]])
    await ingest("POST", "/ingest/problem-areas", { plotId: PL[k].id, acquiredAt: lastScene.at, areas: [{ geometry: small(k, dx, dy), areaHa: 1.6, lon: round(centerOfRing(PL[k].ring).lon + dx, 6), lat: round(centerOfRing(PL[k].ring).lat + dy, 6), meanNdvi: mean, plotMedianNdvi: 0.74 }] });
  for (const p of plotList) {
    const loss = p.key === "p2";
    await ingest("POST", "/ingest/eudr", { plotId: p.id, status: loss ? "possible_loss" : "no_change", plotAreaHa: p.areaHa, forestRefHa: loss ? round(p.areaHa * 0.7, 2) : 0, lossHa: loss ? 1.4 : 0, validPct: round(between(93, 99), 1), refYear: 2020, curYear: 2026, refFromAt: Date.parse("2020-09-01"), refToAt: Date.parse("2020-12-31"), curFromAt: at(70), curToAt: at(5), refScenes: 7, curScenes: 6, changes: loss ? [{ geometry: small("p2", 0.0003, 0.0001, 0.0012), areaHa: 1.4 }] : [] });
  }
  const refKey = "2019-01-01_2026-10-01";
  for (const k of ["p1", "p2", "l4", "n4"]) {
    const a = PL[k].areaHa, forest = k === "p2" ? 0.55 : 0;
    await ingest("POST", "/ingest/analyses", { plotId: PL[k].id, kind: "cover_change", refKey, fromAt: Date.parse("2019-01-01"), toAt: Date.parse("2026-10-01"), plotAreaHa: a, validPct: 96, metrics: { from: { forest: round(a * forest * 1.15, 2), pasture: round(a * (k === "l4" || k === "n4" ? 0 : 0.8 - forest), 2), crop: round(a * (k === "l4" || k === "n4" ? 1 : 0.05), 2), other: round(a * 0.1, 2) }, to: { forest: round(a * forest, 2), pasture: round(a * (k === "l4" || k === "n4" ? 0 : 0.85 - forest), 2), crop: round(a * (k === "l4" || k === "n4" ? 1 : 0.05), 2), other: round(a * 0.1, 2) }, forestToPasture: k === "p2" ? 1.1 : 0, forestToCrop: 0, forestToOther: k === "p2" ? 0.3 : 0 }, changes: k === "p2" ? [{ geometry: small("p2", 0.0003, 0.0001, 0.0012), areaHa: 1.4, severity: "high" }] : [] });
  }
  await ingest("POST", "/ingest/analyses", { plotId: PL.p2.id, kind: "burned", refKey: dayStr(36), fromAt: at(37), toAt: at(30), plotAreaHa: PL.p2.areaHa, validPct: 94, metrics: { eventAt: at(36, 15), burnedHa: 2.6, highHa: 0.9, hotspots: 7 }, changes: [{ geometry: small("p2", -0.0006, -0.0003, 0.0014), areaHa: 2.6, severity: "moderate" }] });
  // zonas de manejo (job mgmt_zones): tres franjas en los lotes rectangulares de la Norte
  for (const k of ["n2", "n3", "n4"]) {
    const ring = PL[k].ring, xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], w = (x1 - x0) / 3;
    const zones = [1, 2, 3].map((z) => ({ zone: z, areaHa: round(PL[k].areaHa / 3, 2), pct: 33.3, meanNdvi: [0.58, 0.71, 0.82][z - 1], geometry: { type: "MultiPolygon", coordinates: [[[[x0 + w * (z - 1), y0], [x0 + w * z, y0], [x0 + w * z, y1], [x0 + w * (z - 1), y1], [x0 + w * (z - 1), y0]]]] } }));
    await ingest("POST", "/ingest/management-zones", { plotId: PL[k].id, seasons: [2023, 2024, 2025], zones });
  }
  log(`escenas, ${rows.length} estadísticas de vigor, clima, riesgo, SPI, fuego, EUDR, cobertura y zonas`);
}

// ---------- paso 12: actividad de las personas (la app abre sesión y sincroniza) ----------
async function stepActivity() {
  for (const [who, c] of Object.entries(S.sessions)) {
    if (who === "owner") continue;
    await c.get("/sync/state").catch(() => {}); await c.get("/me").catch(() => {}); await c.get("/org/tasks").catch(() => {});
    await c.post("/devices", { id: `manual-${who}`, platform: "android", appVersion: "1.4.0" }).catch(() => {});
  }
  log("actividad de los empleados");
}

// ---------- paso 13: historia de vigor de campañas anteriores (job s2_history) ----------
async function stepIngestHistory() {
  const plotList = Object.values(S.plots), rows = [];
  const t0 = Date.parse("2022-01-01T13:40:00-03:00"), t1 = NOW - 150 * DAY;
  for (let t = t0; t < t1; t += 12 * DAY) {
    if (rnd() < 0.2) continue;
    const d = new Date(t), year = d.getUTCFullYear();
    const sc = await ingest("POST", "/ingest/scenes", { source: "sentinel-2", itemId: `S2A_21JXK_${d.toISOString().slice(0, 10).replaceAll("-", "")}_0_L2A`, acquiredAt: t, cloudPct: round(between(0, 25), 1) });
    const sceneId = sc.id ?? sc.sceneId ?? String(sc);
    const dd = (Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(year - (d.getUTCMonth() < 9 ? 1 : 0), 9, 10)) / DAY;
    const yearFactor = 0.9 + ((year * 7919) % 100) / 500;
    for (const p of plotList) {
      const v = p.kind === "pasture" ? 0.62 + 0.08 * Math.sin((dd / 365) * 6.28) : dd >= 0 && dd < 130 ? 0.2 + 0.68 * Math.pow(Math.sin((Math.PI * dd) / 130), 1.3) * yearFactor : 0.24 + 0.04 * Math.sin(dd / 20);
      const m = round(Math.min(0.9, Math.max(0.1, v + between(-0.03, 0.03))), 3);
      rows.push({ plotId: p.id, sceneId, acquiredAt: t, idx: "ndvi", mean: m, p10: round(m - 0.07, 3), p90: round(Math.min(0.95, m + 0.06), 3), validPct: round(between(88, 100), 1), lowConfidence: false });
    }
  }
  for (const part of chunks(rows, 40)) await ingest("POST", "/ingest/plot-index-stats", { rows: part });
  log(`${rows.length} estadísticas de vigor de campañas anteriores`);
}

// ---------- paso 14: más tratamientos del mes (el calendario sanitario muestra un mes por vez) ----------
async function stepSanitary2() {
  const o = S.owner, F1 = S.farms[1].id;
  const E = (reason, ago, categories, product, extra = {}) => o.post("/org/sanitary-events", { reason, plannedDate: dayStr(ago), farmId: F1, categories, product, createTasks: false, ...extra });
  await E("desparasitacion", 12, ["novillo"], "Ivermectina 1 %"); // hecha: hay un tratamiento registrado
  await E("otro", 8, ["ternero"], "Vitaminas ADE", { note: "Refuerzo antes del destete" });
  await E("garrapata", -5, ["vaca", "toro", "novillo"], "Garrapaticida Cypermil", { createTasks: true });
  await E("brucelosis", -12, ["vaquilla"], "Vacuna B19", { createTasks: true });
  await E("aftosa", -18, ["vaca", "vaquilla", "novillo", "ternero", "toro"], "Vacuna antiaftosa", { createTasks: true, note: "Campaña de noviembre" });
  log("tratamientos del mes");
}

// ---------- paso 15: presupuesto de ventas y dispositivo del dueño ----------
async function stepBudgetSales() {
  const o = S.owner;
  for (const [crop, amountPyg] of [["soja", 1_350_000_000], ["maiz", 420_000_000], ["girasol", 95_000_000], ["trigo", 118_000_000]])
    await o.post("/org/erp/budget-lines", { seasonId: S.seasons.cur, crop, activity: "agricultura", category: "sale", amountPyg, note: "Ingreso esperado por la venta de la cosecha" });
  await o.post("/devices", { id: "manual-owner", platform: "web", appVersion: "web" }).catch(() => {});
  await o.get("/me").catch(() => {});
  log("presupuesto de ventas");
}

// ---------- paso 16: tratamiento hecho este mes (para que el calendario sanitario muestre uno "hecho") ----------
async function stepHealthDone() {
  const P = S.prod;
  await pushRecords([rec("health", "p2", 9, 9, { reason: "desparasitacion", product: P.ivermec.name, productId: P.ivermec.id, quantity: 3, dose: "1 ml cada 50 kg", counts: { novillo: 58, vaquilla: 20 } })]);
  log("tratamiento sanitario hecho");
}

// ---------- paso 17: abigeato (lo carga el dueño desde la oficina) ----------
async function stepTheft() {
  await pushRecords([rec("theft", "p2", 27, 12, { category: "novillo", head: 2, policeReport: "2026-1187", reportedAt: at(27, 13) }, { author: "owner" })]);
  log("abigeato");
}

// @@MAIN
const STEPS = [stepOrg, stepGeography, stepTeam, stepCatalog, stepErpMasters, stepPurchases, stepErpMasters2, stepRecords, stepTasks, stepLivestock, stepFeed, stepSanitary, stepErpMoney, stepErpMoney2, stepAgri, stepIntegrations, stepIngest, stepActivity, stepIngestHistory, stepSanitary2, stepBudgetSales, stepHealthDone, stepTheft];
const STATE = process.env.SEED_STATE; // opcional: guarda el avance para retomar con RESUME=1 sin pedir otros códigos de ingreso
const save = () => STATE && writeFileSync(STATE, JSON.stringify(S, (k, v) => (v && v.call && v.session ? { __client: v.session } : v)));
const load = () => {
  const revive = (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v.__client ? client(v.__client) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))) : v);
  const raw0 = JSON.parse(readFileSync(STATE, "utf8"));
  for (const [k, v] of Object.entries(raw0)) S[k] = Array.isArray(v) ? v : revive(v);
};
async function main() {
  if (process.env.RESUME && STATE && existsSync(STATE)) load();
  S.done ??= [];
  for (const step of STEPS) {
    if (S.done.includes(step.name)) continue;
    try { await step(); S.done.push(step.name); save(); } catch (e) { console.error(`\nFALLÓ en ${step.name}: ${e.message}`); process.exit(1); }
  }
  console.log(JSON.stringify({ ownerEmail: S.ownerEmail, session: S.owner.session, farms: S.farms }, null, 0));
}
main();
