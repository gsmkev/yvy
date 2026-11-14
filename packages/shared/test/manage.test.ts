import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, ROLES, setLocale } from "../src";
import { climateSummary, dayRangeMs, dueLabel, gaugeBetween, hasManageTab, isAdminRole, manageNav, oddityReason, rainBetween, rainByDate, sortReview, tasksByDay, weekDays, weekStart } from "../src/manage";

afterEach(() => setLocale(DEFAULT_LOCALE));

const ids = (role: (typeof ROLES)[number], organizations = 1) => manageNav({ role, organizations }).flatMap((g) => g.items.map((i) => i.id));

describe("menú de gestión por rol", () => {
  it("los roles de campo no tienen pestaña ni entradas", () => {
    for (const r of ["worker", "contractor"] as const) {
      expect(hasManageTab(r)).toBe(false);
      expect(manageNav({ role: r, organizations: 3 })).toEqual([]);
    }
  });

  it("dueño y administrador ven Equipo; agrónomo y supervisor no", () => {
    expect(ids("owner")).toContain("team");
    expect(ids("admin")).toContain("team");
    expect(ids("agronomist")).not.toContain("team");
    expect(ids("supervisor")).not.toContain("team");
  });

  it("el supervisor entra a lo suyo: avisos, para revisar, tareas, calendario, parte y clima", () => {
    expect(ids("supervisor")).toEqual(["alerts", "review", "tasks", "calendar", "report", "climate"]);
  });

  it("Clientes solo aparece con más de una organización", () => {
    expect(ids("agronomist", 1)).not.toContain("clients");
    expect(ids("agronomist", 2)).toContain("clients");
  });

  it("no deja grupos vacíos y todos los roles de oficina tienen pestaña", () => {
    for (const r of ROLES) {
      expect(hasManageTab(r)).toBe(r !== "worker" && r !== "contractor");
      for (const g of manageNav({ role: r, organizations: 1 })) expect(g.items.length).toBeGreaterThan(0);
    }
    expect(isAdminRole("owner") && isAdminRole("admin")).toBe(true);
    expect(isAdminRole("agronomist")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("fechas", () => {
  it("dice la urgencia en palabras y, lejos, dd/mm/aaaa", () => {
    expect(dueLabel("2026-11-14", "2026-11-14")).toBe("Vence hoy");
    expect(dueLabel("2026-11-14", "2026-11-14", true)).toBe("Venció hoy");
    expect(dueLabel("2026-11-15", "2026-11-14")).toBe("Mañana");
    expect(dueLabel("2026-11-13", "2026-11-14")).toBe("Venció ayer");
    expect(dueLabel("2026-11-11", "2026-11-14")).toBe("Venció hace 3 días");
    expect(dueLabel("2026-11-17", "2026-11-14")).toBe("En 3 días");
    expect(dueLabel("2026-12-24", "2026-11-14")).toBe("24/12/2026");
  });

  it("la semana empieza el lunes", () => {
    expect(weekStart("2026-11-14")).toBe("2026-11-09"); // sábado
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekDays("2026-11-09")).toHaveLength(7);
    expect(weekDays("2026-11-09")[6]).toBe("2026-11-15");
  });

  it("agrupa las labores por día, con hora primero y sin las canceladas", () => {
    const days = weekDays("2026-11-09");
    const mk = (id: string, dueDate: string, dueTime: string | null, priority = "normal", status = "open") => ({ id, dueDate, dueTime, priority, status });
    const out = tasksByDay([mk("a", "2026-11-10", null, "high"), mk("b", "2026-11-10", "08:00"), mk("c", "2026-11-10", null, "normal"), mk("x", "2026-11-10", null, "normal", "cancelled"), mk("z", "2026-12-01", null)], days);
    expect(out.get("2026-11-10")!.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect([...out.values()].flat()).toHaveLength(3);
  });
});

describe("registros raros", () => {
  it("explica cada regla con voseo y es-PY", () => {
    expect(oddityReason({ rule: "rain_high", mm: 180, max: 150 })).toContain("180");
    expect(oddityReason({ rule: "yield_impossible", tHa: 25, max: 7, crop: "soja" })).toBe("Rinde de 25 t/ha en Soja; lo máximo creíble es 7 t/ha.");
    expect(oddityReason({ rule: "dose_out_of_range", product: "Glifosato", dose: 9, unit: "l_ha", min: 1, max: 4, baseUnit: "l" })).toBe("Dosis de Glifosato: 9 L/ha; lo habitual es 1 a 4 l/ha.");
    expect(oddityReason({ rule: "dose_out_of_range", product: "X", dose: 9, unit: "l_ha", min: null, max: 4, baseUnit: "l" })).toContain("hasta 4 l/ha");
    expect(oddityReason({ rule: "pest_off_season", pest: "chinche", month: 7 })).toBe("Plaga (Chinche) registrada en julio, fuera de su época.");
  });

  it("ordena primero lo que puede costar plata", () => {
    const a = { id: "rain", capturedAt: 3, oddities: [{ rule: "rain_high" }] };
    const b = { id: "dose", capturedAt: 1, oddities: [{ rule: "dose_out_of_range" }] };
    const c = { id: "dose2", capturedAt: 2, oddities: [{ rule: "dose_out_of_range" }] };
    expect(sortReview([a, b, c]).map((x) => x.id)).toEqual(["dose2", "dose", "rain"]);
  });
});

describe("lluvia y clima", () => {
  const daily = [
    { date: "2026-11-10", source: "chirps_prelim", precipMm: 5 },
    { date: "2026-11-10", source: "chirps", precipMm: 7 },
    { date: "2026-11-11", source: "chirps_prelim", precipMm: 3 },
    { date: "2026-11-12", source: "otro", precipMm: null },
  ];

  it("CHIRPS final reemplaza a la preliminar del mismo día", () => {
    expect([...rainByDate(daily).entries()]).toEqual([
      ["2026-11-10", 7],
      ["2026-11-11", 3],
    ]);
  });

  it("suma el período y devuelve null sin datos", () => {
    expect(rainBetween(daily, "2026-11-09", "2026-11-12")).toBe(10);
    expect(rainBetween(daily, "2026-10-01", "2026-10-05")).toBeNull();
  });

  it("suma el pluviómetro entre dos instantes", () => {
    const [from, to] = dayRangeMs("2026-11-10", "2026-11-11");
    const g = [
      { capturedAt: from + 1000, mm: 4 },
      { capturedAt: to - 1000, mm: 6 },
      { capturedAt: to + 86_400_000, mm: 50 },
    ];
    expect(gaugeBetween(g, from, to)).toBe(10);
    expect(gaugeBetween([], from, to)).toBeNull();
  });

  it("compara 30 días con lo normal y toma la humedad más reciente", () => {
    const clim = Array.from({ length: 366 }, (_, i) => ({ dayOfYear: i + 1, variable: "precip", mean: 2 }));
    const s = climateSummary(
      { daily: [...daily, { date: "2026-11-09", source: "x", precipMm: null, soilMoisture0_7: 0.31 }], climatology: clim },
      "2026-11-14",
    );
    expect(s.rain30).toBe(10);
    expect(s.normal30).toBe(60);
    expect(s.pctOfNormal).toBe(17);
    expect(s.soilMoisture).toBe(0.31);
    expect(climateSummary({ daily: [] }, "2026-11-14")).toEqual({ rain30: null, normal30: null, pctOfNormal: null, soilMoisture: null });
  });
});
