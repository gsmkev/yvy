// Datos de demostración sobre la estancia de prueba (pnpm --filter api seed): lotes, equipo, registros y tareas.
// Uso: API=http://localhost:8787 DEV_LOG=<log de wrangler dev> node scripts/demo-data.mjs
import { readFileSync } from "node:fs";

const API = process.env.API ?? "http://localhost:8787";
const LOG = process.env.DEV_LOG;
const FARM = "0190a000-0000-7000-8000-000000000010";
const L1 = "0190a000-0000-7000-8000-000000000011";
const L2 = "0190a000-0000-7000-8000-000000000012";

const call = async (method, path, body, token) => {
  const r = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
};
const uuid = () => {
  const ts = Date.now().toString(16).padStart(12, "0");
  const r = crypto.getRandomValues(new Uint8Array(10));
  const h = [...r].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${h.slice(0, 3)}-${((parseInt(h[3], 16) & 3) | 8).toString(16)}${h.slice(4, 7)}-${h.slice(7, 19)}`;
};
const sq = (lon, lat, w, h = w) => ({
  type: "Polygon",
  coordinates: [
    [
      [lon, lat],
      [lon + w, lat],
      [lon + w, lat - h],
      [lon, lat - h],
      [lon, lat],
    ],
  ],
});

await call("POST", "/auth/email/start", { email: "dueno@yvy.test" });
await new Promise((r) => setTimeout(r, 500));
const code = [...readFileSync(LOG, "utf8").matchAll(/código es (\d{6})/g)].at(-1)[1];
const owner = (await call("POST", "/auth/email/verify", { email: "dueno@yvy.test", code })).accessToken;

// Lotes: grilla al sur y al este de los dos lotes con NDVI real
const names = [
  ["Lote 3 · Cañada", "crop", "maiz"],
  ["Lote 4", "crop", "soja"],
  ["Lote 5 · Loma", "crop", "trigo"],
  ["Potrero Norte", "pasture", null],
  ["Potrero del Arroyo", "pasture", null],
  ["Lote 6", "crop", "soja"],
  ["Lote 7", "crop", "girasol"],
];
// Grilla sin superposiciones: [lon, lat, ancho, alto]
const cells = [
  [-55.95, -27.1715, 0.019, 0.018],
  [-55.93, -27.1715, 0.019, 0.018],
  [-55.91, -27.1715, 0.019, 0.018],
  [-55.8985, -27.1505, 0.0075, 0.019],
  [-55.95, -27.1905, 0.019, 0.019],
  [-55.93, -27.1905, 0.019, 0.019],
  [-55.91, -27.1905, 0.019, 0.019],
];
const { ids } = await call(
  "POST",
  `/org/farms/${FARM}/plots`,
  {
    plots: names.map(([name, kind, crop], i) => ({
      name,
      kind,
      crop,
      season: kind === "crop" ? "zafra" : null,
      geometry: sq(...cells[i]),
    })),
  },
  owner,
);
const plots = [L1, L2, ...ids];

for (const [kind, name, lon, lat] of [
  ["rain_gauge", "Pluviómetro casa", -55.925, -27.168],
  ["water", "Tajamar grande", -55.94, -27.2],
  ["house", "Casa principal", -55.923, -27.17],
  ["corral", "Corral", -55.918, -27.165],
])
  await call("POST", `/org/farms/${FARM}/pois`, { kind, name, lon, lat }, owner);

const team = [];
for (const [fullName, role, email] of [
  ["Ramón Benítez", "worker"],
  ["Celso Gamarra", "worker"],
  ["Lidia Ortiz", "worker"],
  ["Ing. Ana Villalba", "agronomist", "ana@agro.test"],
]) {
  const { userId } = await call("POST", "/org/members", { fullName, role, email: email ?? null }, owner);
  team.push({ fullName, role, userId });
}
const assign = { 0: [0, 1, 2], 1: [3, 4, 5], 2: [6, 7, 8] };
for (const [i, idx] of Object.entries(assign))
  await call("PUT", `/org/members/${team[i].userId}/plots`, { plotIds: idx.map((j) => plots[j]) }, owner);

// Sesiones de los empleados por QR y registros de las últimas 2 semanas
const DAY = 86_400_000;
const kinds = [
  [
    "scouting",
    () => ({ condition: ["good", "good", "fair"][Math.floor(Math.random() * 3)], note: "Recorrida sin novedades" }),
  ],
  ["pest", () => ({ pest: "chinche", intensity: "medium", note: "Foco en la cabecera del lote" })],
  ["crop_status", () => ({ stage: "vegetativo", condition: "good" })],
  ["rain", () => ({ mm: [12, 8, 23, 4][Math.floor(Math.random() * 4)], readAt: Date.now() })],
  ["pasture_status", () => ({ heightCm: 18, cover: "medium", livestockPresent: true })],
  ["water", () => ({ level: "half" })],
];
for (const [i, idx] of Object.entries(assign)) {
  const { code: link } = await call("POST", "/auth/link", { userId: team[i].userId }, owner);
  const s = await call("POST", "/auth/link/redeem", { code: link, deviceId: `demo-${i}` });
  const muts = [];
  for (let d = 0; d < 13; d++) {
    const plotIdx = idx[d % idx.length];
    const [kind, data] = kinds[(d + Number(i)) % kinds.length];
    const base = plotIdx === 0 ? [-55.95, -27.15] : plotIdx === 1 ? [-55.92, -27.15] : cells[plotIdx - 2];
    muts.push({
      mutationId: uuid(),
      kind: "records.upsert",
      row: {
        id: uuid(),
        farmId: FARM,
        plotId: plots[plotIdx],
        poiId: null,
        kind: kind === "pasture_status" && plotIdx < 5 ? "scouting" : kind,
        data: kind === "pasture_status" && plotIdx < 5 ? { condition: "good" } : data(),
        schemaVersion: 1,
        lon: base[0] + 0.004 + Math.random() * 0.012,
        lat: base[1] - 0.004 - Math.random() * 0.012,
        gpsAccuracyM: 4 + Math.round(Math.random() * 8),
        capturedAt: Date.now() - d * DAY - Math.floor(Math.random() * 6) * 3_600_000,
      },
    });
  }
  await call("POST", "/sync/push", { deviceId: `demo-${i}`, mutations: muts }, s.accessToken);
}

const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
for (const [i, title, kind, recurrence] of [
  [0, "Medir lluvia", "rain", "daily"],
  [1, "Revisar aguada del potrero", "water", "weekly"],
  [2, "Recorrer lotes de soja", "scouting", "none"],
  [0, "Monitoreo de chinche en Lote 2", "pest", "none"],
])
  await call(
    "POST",
    "/org/tasks",
    { farmId: FARM, assigneeId: team[i].userId, title, kind, dueDate: today, recurrence },
    owner,
  );

console.log(`listo: ${plots.length} lotes, ${team.length} personas, 39 registros`);
