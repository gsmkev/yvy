import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MUTATIONS_PER_PUSH,
  buildBatch,
  formatReport,
  percentile,
  recordsPerPush,
  splitRecords,
  summarize,
} from "./load-sync.mjs";

test("percentil por rango más cercano", () => {
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(v, 50), 50);
  assert.equal(percentile(v, 95), 100);
  assert.equal(percentile([7], 99), 7);
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([3, 1, 2], 50), 2); // no depende del orden de entrada
});

test("1.000 registros entre 10 empleados son 100 cada uno; el resto se reparte", () => {
  assert.deepEqual(splitRecords(1000, 10), Array(10).fill(100));
  assert.deepEqual(splitRecords(7, 3), [3, 2, 2]);
  assert.equal(splitRecords(1003, 10).reduce((a, b) => a + b, 0), 1003);
});

test("un push nunca pasa del máximo de mutaciones del protocolo", () => {
  for (const photos of [0, 1, 2, 3]) {
    const per = recordsPerPush(photos);
    const { mutations, records } = buildBatch({ farmId: "f", plotId: "p", n: per, photos });
    assert.equal(records.length, per);
    assert.equal(mutations.length, per * (1 + photos));
    assert.ok(mutations.length <= MAX_MUTATIONS_PER_PUSH, `${photos} fotos: ${mutations.length}`);
  }
});

test("el lote trae registros y fotos ligadas con ids únicos", () => {
  let n = 0;
  const id = () => `id-${n++}`;
  const { mutations, records } = buildBatch({ farmId: "f", plotId: "p", n: 2, photos: 2, now: 1_000_000, id });
  assert.equal(new Set(mutations.map((m) => m.mutationId)).size, mutations.length);
  const photos = mutations.filter((m) => m.kind === "attachments.upsert");
  assert.equal(photos.length, 4);
  assert.ok(photos.every((p) => records.includes(p.row.recordId) && p.row.mime === "image/webp"));
  const rec = mutations.find((m) => m.kind === "records.upsert");
  assert.deepEqual([rec.row.farmId, rec.row.plotId, rec.row.kind], ["f", "p", "scouting"]);
});

test("el resumen cuenta fallas por motivo y calcula tiempos y rendimiento", () => {
  const s = summarize({
    pushes: [
      { ms: 100, ok: true },
      { ms: 300, ok: true },
      { ms: 900, ok: false, failures: ["http_503:1102", "rechazada_forbidden"] },
      { ms: 200, ok: false, failures: ["http_503:1102"] },
    ],
    elapsedMs: 2000,
    records: 100,
    photos: 200,
  });
  assert.equal(s.pushes, 4);
  assert.equal(s.pushesOk, 2);
  assert.equal(s.recordsPerSecond, 50);
  assert.equal(s.ms.max, 900);
  assert.equal(s.ms.p50, 200);
  assert.deepEqual(s.failures, { "http_503:1102": 2, rechazada_forbidden: 1 });
  assert.equal(s.failed, 3);
});

test("el informe dice OK o FALLÓ y muestra los números clave", () => {
  const summary = summarize({ pushes: [{ ms: 50, ok: true }], elapsedMs: 1000, records: 10, photos: 20 });
  const check = {
    recordsExpected: 10,
    recordsOnServer: 10,
    duplicates: 0,
    photosExpected: 20,
    photosOnServer: 20,
    replayChangedCount: false,
  };
  const good = formatReport({ ok: true, summary, check });
  assert.match(good, /10 registros\/s|→ 10 registros\/s/);
  assert.match(good, /10\/10 registros, 20\/20 fotos, 0 duplicados/);
  assert.match(good, /OK$/);
  assert.match(formatReport({ ok: false, summary, check: { ...check, replayChangedCount: true } }), /FALLÓ$/);
});
