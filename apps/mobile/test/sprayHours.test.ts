import { describe, expect, it } from "vitest";
import type { Kv } from "../src/lib/forecast";
import { refreshSprayHours, sprayPrefill } from "../src/lib/sprayHours";

const memKv = (): Kv => {
  const m = new Map<string, string>();
  return { getKv: (k) => m.get(k) ?? null, setKv: (k, v) => void (v === null ? m.delete(k) : m.set(k, v)) };
};
const H = 3_600_000;
const hours = [
  { at: 10 * H, tempC: 24.46, windKmh: 12.4, humidityPct: 58.2 },
  { at: 11 * H, tempC: 26, windKmh: null, humidityPct: 50 },
];

describe("precarga de condiciones al aplicar (A-12)", () => {
  it("baja las horas, las guarda y precarga la de ahora sin señal", async () => {
    const kv = memKv();
    await refreshSprayHours(kv, "f1", async () => ({ hours }), 10 * H);
    expect(sprayPrefill(kv, "f1", 10 * H + 5)).toEqual({ windKmh: 12, tempC: 24.5, humidityPct: 58 });
    expect(sprayPrefill(kv, "f1", 11 * H)).toEqual({ tempC: 26, humidityPct: 50 });
  });
  it("sin pronóstico que llegue a esta hora no precarga nada", async () => {
    const kv = memKv();
    expect(sprayPrefill(kv, "f1", 10 * H)).toBeNull();
    await refreshSprayHours(kv, "f1", async () => ({ hours }), 10 * H);
    expect(sprayPrefill(kv, "f1", 40 * H)).toBeNull();
    expect(sprayPrefill(kv, undefined, 10 * H)).toBeNull();
  });
  it("sin señal conserva lo guardado", async () => {
    const kv = memKv();
    await refreshSprayHours(kv, "f1", async () => ({ hours }), 0);
    await refreshSprayHours(
      kv,
      "f1",
      async () => {
        throw new Error("offline");
      },
      4 * H,
    );
    expect(sprayPrefill(kv, "f1", 10 * H)).not.toBeNull();
  });
});
