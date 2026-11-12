// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { DamageReport } from "./damagePdf";
import { damageEvidence, damageSatellite, endOfEventDay, recordsRange } from "./damageData";
import type { Farm, Plot, RecordRow } from "./types";

const DAY = 86_400_000;
const square = (lon: number, lat: number, d: number) => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat]]],
});
const farm = {
  id: "f",
  name: "La Esperanza",
  department: "Itapúa",
  district: null,
  areaHa: 100,
  geometry: JSON.stringify(square(-55.9, -27.2, 0.02)),
  minLon: -55.9,
  minLat: -27.22,
  maxLon: -55.88,
  maxLat: -27.2,
} as unknown as Farm;
const plot = { id: "p1", farmId: "f", name: "Lote 1", kind: "crop", crop: "soja", areaHa: 40, sowingDate: "2026-10-01", geometry: JSON.stringify(square(-55.9, -27.2, 0.01)) } as unknown as Plot;

const event = "2026-11-10";
const ev = endOfEventDay(event);
const pass = (offsetDays: number, mean: number, validPct = 95) => ({ acquiredAt: ev + offsetDays * DAY, mean, validPct });
const rec = (id: string, at: number, photo = false) =>
  ({ id, kind: "note", data: { text: "Granizo fuerte" }, capturedAt: at, lon: -55.895, lat: -27.205, attachments: photo ? [{ id: `a-${id}`, uploadStatus: "uploaded" }] : [] }) as unknown as RecordRow;

describe("C-09 · informe de daños", () => {
  it("toma la última pasada válida antes y la primera después del evento", () => {
    const s = damageSatellite([pass(-12, 0.8), pass(-3, 0.78), pass(-1, 0.3, 20), pass(4, 0.5, 30), pass(6, 0.55), pass(20, 0.6)], event);
    expect(s.before?.mean).toBe(0.78);
    expect(s.after?.mean).toBe(0.55); // la de 4 días tiene muchas nubes
    expect(s.changePct).toBe(-29.5);
    expect(s.series.length).toBe(4); // sin las pasadas con nubes
  });

  it("sin pasada de un lado no hay cambio calculado", () => {
    const s = damageSatellite([pass(-3, 0.8)], event);
    expect(s.after).toBeNull();
    expect(s.changePct).toBeNull();
  });

  it("junta los registros de alrededor y prioriza las fotos más cercanas al evento", () => {
    const rows = [rec("late", ev + 20 * DAY, true), rec("near", ev + DAY, true), rec("nophoto", ev, false), rec("early", ev - 5 * DAY)];
    const e = damageEvidence(rows, event, 1);
    expect(e.records.map((r) => r.id)).toEqual(["early", "nophoto", "near", "late"]);
    expect(e.withPhotos.map((r) => r.id)).toEqual(["near"]);
    const r = recordsRange(event);
    expect(r.to - r.from).toBeGreaterThan(59 * DAY);
  });

  it("genera un PDF válido con y sin datos satelitales", async () => {
    const evidence = damageEvidence([rec("a", ev - DAY), rec("b", ev + DAY)], event);
    for (const series of [[pass(-3, 0.8), pass(5, 0.5)], []]) {
      const buf = await renderToBuffer(
        <DamageReport farm={farm} plot={plot} eventDay={event} cause="hail" description="Granizo de 10 minutos" series={series} evidence={evidence} photoUrls={[]} generatedAt={ev} author="Ing. Gómez" />,
      );
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(1500);
    }
  });
});
