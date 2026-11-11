#!/usr/bin/env node
/**
 * Prueba de carga del sync (P-21): N empleados mandan en paralelo M registros con metadatos de fotos contra un
 * `wrangler dev` y se mide tiempo por push, rendimiento y fallas. Sin dependencias (Node 22).
 *
 * Uso (con `pnpm --filter api dev > /tmp/dev.log 2>&1` andando y las migraciones locales aplicadas):
 *   node scripts/load-sync.mjs --log /tmp/dev.log [--api http://localhost:8787] [--workers 10] [--records 1000] [--photos 2]
 *
 * Crea su propia organización de prueba (el código de ingreso se lee del log de wrangler dev, como en los E2E),
 * una estancia con un lote por empleado, y al final comprueba contra el servidor que llegó cada registro y cada foto
 * una sola vez y que repetir un push no duplica nada. Sale con código 1 si hubo fallas o no cuadran los conteos.
 * Variables: YVY_LOAD_API, E2E_DEV_LOG (equivalentes a --api y --log).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Mismo valor que LIMITS.sync.maxMutationsPerPush (packages/shared/src/limits.ts)
export const MAX_MUTATIONS_PER_PUSH = 40;

// ---------- Cálculos puros (probados en load-sync.test.mjs) ----------

/** Percentil por rango más cercano de una lista de números (0 si está vacía). */
export const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};

/** Reparte `total` registros entre `workers` empleados (los primeros reciben el resto). */
export const splitRecords = (total, workers) =>
  Array.from({ length: workers }, (_, i) => Math.floor(total / workers) + (i < total % workers ? 1 : 0));

/** Cuántos registros caben en un push si cada uno trae `photos` fotos (1 mutación el registro + 1 por foto). */
export const recordsPerPush = (photos, max = MAX_MUTATIONS_PER_PUSH) => Math.max(1, Math.floor(max / (1 + photos)));

/** Arma las mutaciones de `n` registros de un empleado con `photos` fotos cada uno. */
export function buildBatch({ farmId, plotId, n, photos, now = Date.now(), id = randomUUID }) {
  const mutations = [];
  const records = [];
  for (let i = 0; i < n; i++) {
    const recordId = id();
    records.push(recordId);
    mutations.push({
      mutationId: id(),
      kind: "records.upsert",
      row: {
        id: recordId,
        farmId,
        plotId,
        poiId: null,
        kind: "scouting",
        data: { condition: "good", note: "prueba de carga" },
        schemaVersion: 1,
        lon: -55.94,
        lat: -27.16,
        gpsAccuracyM: 8,
        capturedAt: now - i * 1000,
      },
    });
    for (let p = 0; p < photos; p++)
      mutations.push({
        mutationId: id(),
        kind: "attachments.upsert",
        row: { id: id(), recordId, mime: "image/webp", width: 1280, height: 960, bytes: 150_000 + p * 1000 },
      });
  }
  return { mutations, records };
}

/** Resume una corrida: tiempos por push, rendimiento y fallas por motivo. */
export function summarize({ pushes, elapsedMs, records, photos }) {
  const ok = pushes.filter((p) => p.ok);
  const times = pushes.map((p) => p.ms);
  const failures = {};
  for (const p of pushes) for (const f of p.failures ?? []) failures[f] = (failures[f] ?? 0) + 1;
  return {
    pushes: pushes.length,
    pushesOk: ok.length,
    records,
    photos,
    elapsedMs,
    recordsPerSecond: elapsedMs > 0 ? Math.round((records / elapsedMs) * 1000 * 10) / 10 : 0,
    ms: {
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      max: times.length ? Math.max(...times) : 0,
      mean: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    },
    failures,
    failed: Object.values(failures).reduce((a, b) => a + b, 0),
  };
}

// ---------- Corrida contra el servidor ----------

async function call(api, method, path, body, token) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(`${api}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    return { status: 0, data: { error: String(e.cause?.code ?? e.message) }, ms: performance.now() - t0 };
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 120) };
  }
  return { status: res.status, data, ms: performance.now() - t0 };
}

const must = async (api, method, path, body, token) => {
  const r = await call(api, method, path, body, token);
  if (r.status < 200 || r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

const square = (lon, lat, d) => ({
  type: "Polygon",
  coordinates: [
    [
      [lon, lat],
      [lon + d, lat],
      [lon + d, lat - d],
      [lon, lat - d],
      [lon, lat],
    ],
  ],
});

/** Prepara la organización: dueño, estancia, un lote por empleado, empleados vinculados. Devuelve sus sesiones. */
async function setup({ api, log, workers }) {
  const email = `carga-${Date.now()}@yvy.test`;
  await must(api, "POST", "/auth/signup", { organizationName: "Carga sync", fullName: "Dueña de prueba", email });
  await must(api, "POST", "/auth/email/start", { email });
  await new Promise((r) => setTimeout(r, 300));
  const code = [...readFileSync(log, "utf8").matchAll(/código es (\d{6})/g)].at(-1)?.[1];
  if (!code) throw new Error(`No encontré el código de ingreso en ${log} (¿wrangler dev escribe ahí?)`);
  const owner = await must(api, "POST", "/auth/email/verify", { email, code });
  const farm = await must(api, "POST", "/org/farms", { name: "Carga", geometry: square(-56, -27, 0.28) }, owner.accessToken);
  const plots = [];
  for (let i = 0; i < workers; i += 40) {
    const n = Math.min(40, workers - i);
    const r = await must(
      api,
      "POST",
      `/org/farms/${farm.id}/plots`,
      {
        plots: Array.from({ length: n }, (_, k) => ({
          name: `Lote ${i + k + 1}`,
          kind: "crop",
          geometry: square(-55.995 + ((i + k) % 10) * 0.025, -27.005 - Math.floor((i + k) / 10) * 0.025, 0.02),
        })),
      },
      owner.accessToken,
    );
    plots.push(...r.ids);
  }
  const sessions = [];
  for (let i = 0; i < workers; i++) {
    const m = await must(api, "POST", "/org/members", { fullName: `Empleado ${i + 1}`, role: "worker" }, owner.accessToken);
    await must(api, "PUT", `/org/members/${m.userId}/plots`, { plotIds: [plots[i]] }, owner.accessToken);
    const link = await must(api, "POST", "/auth/link", { userId: m.userId }, owner.accessToken);
    const s = await must(api, "POST", "/auth/link/redeem", { code: link.code, deviceId: `carga-${i + 1}` });
    sessions.push({ token: s.accessToken, plotId: plots[i], deviceId: `carga-${i + 1}` });
  }
  return { owner: owner.accessToken, farmId: farm.id, sessions };
}

/** Un empleado manda sus registros en pushes consecutivos; devuelve una fila por push. */
async function runWorker({ api, farmId, session, n, photos }) {
  const pushes = [];
  const sent = { records: [], attachments: 0, firstBatch: null };
  const per = recordsPerPush(photos);
  for (let left = n; left > 0; left -= per) {
    const { mutations, records } = buildBatch({ farmId, plotId: session.plotId, n: Math.min(per, left), photos });
    const r = await call(api, "POST", "/sync/push", { deviceId: session.deviceId, mutations }, session.token);
    const failures = [];
    if (r.status !== 200) failures.push(`http_${r.status}${r.data?.error ? `:${String(r.data.error).slice(0, 40)}` : ""}`);
    else
      for (const x of r.data.results) {
        if (x.status === "rejected") failures.push(`rechazada_${x.reason}`);
      }
    if (!failures.length) {
      sent.records.push(...records);
      sent.attachments += mutations.length - records.length;
      sent.firstBatch ??= { mutations };
    }
    pushes.push({ ms: r.ms, ok: failures.length === 0, failures, mutations: mutations.length });
  }
  return { pushes, sent };
}

async function pullAll(api, token, table) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const r = await must(api, "POST", "/sync/pull", { table, cursor }, token);
    rows.push(...r.rows);
    cursor = r.cursor ?? cursor;
    if (!r.hasMore) return rows;
  }
}

export async function runLoadTest({ api, log, workers = 10, records = 1000, photos = 2, out = console.log }) {
  out(`Preparando organización de prueba (${workers} empleados)…`);
  const env = await setup({ api, log, workers });
  const share = splitRecords(records, workers);
  out(`Mandando ${records} registros con ${photos} fotos cada uno (${workers} empleados en paralelo)…`);
  const t0 = performance.now();
  const results = await Promise.all(
    env.sessions.map((session, i) => runWorker({ api, farmId: env.farmId, session, n: share[i], photos })),
  );
  const elapsedMs = Math.round(performance.now() - t0);
  const summary = summarize({ pushes: results.flatMap((r) => r.pushes), elapsedMs, records, photos: records * photos });

  // Verificación contra el servidor: cada registro y cada foto exactamente una vez.
  const expectedRecords = new Set(results.flatMap((r) => r.sent.records));
  const expectedPhotos = results.reduce((a, r) => a + r.sent.attachments, 0);
  const serverRecords = await pullAll(api, env.owner, "records");
  const serverAttachments = await pullAll(api, env.owner, "attachments");
  const ids = serverRecords.map((r) => r.id);
  const check = {
    recordsExpected: expectedRecords.size,
    recordsOnServer: ids.filter((id) => expectedRecords.has(id)).length,
    duplicates: ids.length - new Set(ids).size,
    photosExpected: expectedPhotos,
    photosOnServer: serverAttachments.length,
  };
  // Idempotencia: repetir el primer push de cada empleado no cambia nada.
  let replayNotDuplicate = 0;
  for (const [i, r] of results.entries()) {
    if (!r.sent.firstBatch) continue;
    const again = await call(
      api,
      "POST",
      "/sync/push",
      { deviceId: env.sessions[i].deviceId, mutations: r.sent.firstBatch.mutations },
      env.sessions[i].token,
    );
    if (again.status !== 200 || again.data.results.some((x) => x.status !== "duplicate")) replayNotDuplicate++;
  }
  const after = (await pullAll(api, env.owner, "records")).length;
  check.replayChangedCount = after !== serverRecords.length || replayNotDuplicate > 0;

  const ok =
    summary.failed === 0 &&
    check.recordsOnServer === check.recordsExpected &&
    check.recordsExpected === records &&
    check.duplicates === 0 &&
    check.photosOnServer === check.photosExpected &&
    !check.replayChangedCount;
  return { ok, summary, check };
}

export function formatReport({ ok, summary: s, check: c }) {
  const lines = [
    "",
    "Resultado de la prueba de carga del sync",
    `  Registros: ${s.records} (${s.photos} fotos) en ${(s.elapsedMs / 1000).toFixed(1)} s → ${s.recordsPerSecond} registros/s`,
    `  Pushes: ${s.pushes} (${s.pushesOk} sin fallas)`,
    `  Tiempo por push (ms): mediana ${s.ms.p50.toFixed(0)} · p95 ${s.ms.p95.toFixed(0)} · p99 ${s.ms.p99.toFixed(0)} · máx ${s.ms.max.toFixed(0)}`,
    `  Fallas: ${s.failed}${s.failed ? ` ${JSON.stringify(s.failures)}` : ""}`,
    `  En el servidor: ${c.recordsOnServer}/${c.recordsExpected} registros, ${c.photosOnServer}/${c.photosExpected} fotos, ${c.duplicates} duplicados`,
    `  Repetir pushes ${c.replayChangedCount ? "CAMBIÓ los datos (mal)" : "no cambió nada (bien)"}`,
    ok ? "OK" : "FALLÓ",
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  const o = {
    api: process.env.YVY_LOAD_API ?? "http://localhost:8787",
    log: process.env.E2E_DEV_LOG,
    workers: 10,
    records: 1000,
    photos: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--api") o.api = v();
    else if (a === "--log") o.log = v();
    else if (a === "--workers") o.workers = Number(v());
    else if (a === "--records") o.records = Number(v());
    else if (a === "--photos") o.photos = Number(v());
    else throw new Error(`Opción desconocida: ${a}`);
  }
  if (!o.log) throw new Error("Falta --log (o E2E_DEV_LOG): el log de `wrangler dev`, de donde sale el código de ingreso");
  if (!(o.workers >= 1 && o.records >= 1 && o.photos >= 0 && o.photos <= 3)) throw new Error("Valores fuera de rango (fotos 0 a 3)");
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const res = await runLoadTest(parseArgs(process.argv.slice(2)));
    console.log(formatReport(res));
    process.exit(res.ok ? 0 : 1);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}
