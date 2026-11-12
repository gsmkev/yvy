import { describe, expect, it } from "vitest";
import { FORECAST_TTL_MS, daysOld, readForecast, refreshForecast, saveForecast, upcoming, type Kv } from "../src/lib/forecast";

const memKv = (): Kv => {
  const m = new Map<string, string>();
  return { getKv: (k) => m.get(k) ?? null, setKv: (k, v) => void (v === null ? m.delete(k) : m.set(k, v)) };
};
const days = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-11-${String(10 + i).padStart(2, "0")}`,
  tminC: 10,
  tmaxC: 28,
  precipMm: i,
}));

describe("pronóstico en Hoy", () => {
  it("guarda con la hora de descarga y lo lee sin señal", () => {
    const kv = memKv();
    saveForecast(kv, "f1", { runAt: 5, days }, 1000);
    const r = readForecast(kv, "f1")!;
    expect(r.fetchedAt).toBe(1000);
    expect(r.days).toHaveLength(10);
    expect(readForecast(kv, "f2")).toBeNull();
  });

  it("no vuelve a bajar si es reciente; baja si es viejo o se fuerza", async () => {
    const kv = memKv();
    let calls = 0;
    const remote = async () => {
      calls++;
      return { runAt: 1, days };
    };
    await refreshForecast(kv, "f1", remote, 0);
    await refreshForecast(kv, "f1", remote, FORECAST_TTL_MS - 1);
    expect(calls).toBe(1);
    await refreshForecast(kv, "f1", remote, FORECAST_TTL_MS + 1);
    expect(calls).toBe(2);
    await refreshForecast(kv, "f1", remote, FORECAST_TTL_MS + 2, true);
    expect(calls).toBe(3);
  });

  it("sin señal conserva el guardado; sin guardado devuelve null", async () => {
    const kv = memKv();
    const offline = async () => {
      throw new Error("offline");
    };
    expect(await refreshForecast(kv, "f1", offline, 0)).toBeNull();
    saveForecast(kv, "f1", { runAt: 1, days }, 100);
    const r = await refreshForecast(kv, "f1", offline, 100 + FORECAST_TTL_MS * 5);
    expect(r?.fetchedAt).toBe(100);
  });

  it("una respuesta vacía no pisa lo guardado", async () => {
    const kv = memKv();
    saveForecast(kv, "f1", { runAt: 1, days }, 100);
    const r = await refreshForecast(kv, "f1", async () => ({ runAt: null, days: [] }), 100 + FORECAST_TTL_MS + 1);
    expect(r?.fetchedAt).toBe(100);
  });

  it("recorta los días ya pasados y cuenta la antigüedad", () => {
    const kv = memKv();
    const f = saveForecast(kv, "f1", { runAt: 1, days }, 0);
    expect(upcoming(f, "2026-11-12")[0]!.date).toBe("2026-11-12");
    expect(daysOld(0, 3 * 86_400_000 + 5)).toBe(3);
  });
});
