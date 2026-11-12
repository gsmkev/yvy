import { describe, expect, it } from "vitest";
import { trackSchema } from "@yvy/shared";
import { addFix, buildTrack, formatDuration, isTooShort, newDraft, parseDraft, serializeDraft, type WalkDraft } from "../src/lib/walkTracker";

const M = 1 / 111_320;
const fix = (i: number, accuracy: number | null = 5) => ({ lon: -55, lat: -26 + i * 10 * M, accuracy, at: 1_000 + i * 5000 });

const walk = (n: number, d: WalkDraft = newDraft(1_000)) => {
  for (let i = 0; i < n; i++) d = addFix(d, fix(i));
  return d;
};

describe("recorrida GPS (F-05)", () => {
  it("acumula distancia entre fixes", () => {
    const d = walk(11); // 10 tramos de 10 m
    expect(d.points).toHaveLength(11);
    expect(Math.round(d.distanceM)).toBe(100);
  });

  it("descarta fixes con mala precisión", () => {
    const d = addFix(newDraft(0), { lon: -55, lat: -26, accuracy: 80, at: 1 });
    expect(d.points).toHaveLength(0);
  });

  it("no cuenta el temblor del GPS estando quieto", () => {
    let d = addFix(newDraft(0), { lon: -55, lat: -26, accuracy: 5, at: 1 });
    for (let i = 0; i < 20; i++) d = addFix(d, { lon: -55 + (i % 2) * 2 * M, lat: -26, accuracy: 5, at: 2 + i });
    expect(d.points).toHaveLength(1);
    expect(d.distanceM).toBe(0);
  });

  it("marca como corta una recorrida de menos de 20 m", () => {
    expect(isTooShort(walk(2))).toBe(true);
    expect(isTooShort(walk(5))).toBe(false);
  });

  it("arma un registro track válido con tiempo real y línea simplificada", () => {
    const d = walk(101);
    const track = buildTrack(d, 1_000 + 100 * 5000);
    expect(track.line.length).toBe(2); // recta: queda solo inicio y fin
    expect(Math.abs(track.distanceM - 1000)).toBeLessThanOrEqual(3);
    expect(track.durationS).toBe(500);
    expect(trackSchema.safeParse(track).success).toBe(true);
  });

  it("respeta el tope de puntos con un camino sinuoso largo", () => {
    let d = newDraft(0);
    for (let i = 0; i < 3000; i++) d = addFix(d, { lon: -55 + Math.sin(i / 7) * 40 * M, lat: -26 + i * 6 * M, accuracy: 4, at: i * 3000 });
    const track = buildTrack(d, 3000 * 3000);
    expect(track.line.length).toBeLessThanOrEqual(500);
    expect(trackSchema.safeParse(track).success).toBe(true);
  });

  it("el esquema rechaza una recorrida que termina antes de empezar", () => {
    expect(
      trackSchema.safeParse({ line: [[-55, -26], [-55, -25.9]], distanceM: 10, durationS: 5, startedAt: 10, endedAt: 5 }).success,
    ).toBe(false);
  });

  it("serializa y recupera el borrador", () => {
    const d = walk(4);
    expect(parseDraft(serializeDraft(d))).toEqual(d);
    expect(parseDraft("basura")).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });

  it("formatea la duración", () => {
    expect(formatDuration(95)).toBe("1 min");
    expect(formatDuration(3900)).toBe("1 h 05");
  });
});
