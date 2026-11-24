/** Pruebas de calendario oficial de SENACSA; recordatorios. */
import { describe, expect, it } from "vitest";
import { officialCampaigns, senacsaPlanDate, senacsaReminderWindow, senacsaReminders, SENACSA_CAMPAIGNS } from "../src";

describe("calendario oficial de SENACSA", () => {
  it("2026: dos períodos de aftosa y de brucelosis de terneras, con fuente", () => {
    const c = officialCampaigns(2026, { hasLivestock: true });
    expect(c.map((x) => x.id)).toEqual([
      "senacsa-2026-1-aftosa",
      "senacsa-2026-1-brucelosis",
      "senacsa-2026-2-aftosa",
      "senacsa-2026-2-brucelosis",
    ]);
    expect(c[0]).toMatchObject({ from: "2026-02-17", to: "2026-03-28", registerUntil: "2026-04-04" });
    expect(c[2]!.to).toBe("2026-06-26");
    expect(c.every((x) => x.source.length > 0)).toBe(true);
    expect(c[1]!.categories).toEqual(["ternero"]);
  });
  it("sin hacienda o sin año cargado no hay campañas", () => {
    expect(officialCampaigns(2026, { hasLivestock: false })).toEqual([]);
    expect(officialCampaigns(2030, { hasLivestock: true })).toEqual([]);
  });
  it("ids únicos", () => {
    expect(new Set(SENACSA_CAMPAIGNS.map((c) => c.id)).size).toBe(SENACSA_CAMPAIGNS.length);
  });
});

describe("recordatorios", () => {
  const all = officialCampaigns(2026, { hasLivestock: true });
  const types = (today: string, v?: (c: (typeof all)[number]) => boolean) => senacsaReminders(all, today, v).map((r) => r.key);
  it("14 días antes de abrir", () => {
    expect(types("2026-02-02")).toEqual([]);
    expect(types("2026-02-03")).toEqual(["2026-1:before"]);
    expect(types("2026-02-16")).toEqual(["2026-1:before"]);
  });
  it("al abrir y mientras dura", () => {
    expect(types("2026-02-17")).toEqual(["2026-1:open"]);
    expect(types("2026-03-01")).toEqual(["2026-1:open"]);
  });
  it("7 días antes del cierre solo si falta vacunar, y solo lo que falta", () => {
    expect(types("2026-03-21")).toEqual(["2026-1:open", "2026-1:closing"]);
    const r = senacsaReminders(all, "2026-03-21", (c) => c.reason === "aftosa").find((x) => x.type === "closing")!;
    expect(r.campaigns.map((c) => c.reason)).toEqual(["brucelosis"]);
    expect(types("2026-03-21", () => true)).toEqual(["2026-1:open"]);
    expect(types("2026-03-20")).toEqual(["2026-1:open"]);
  });
  it("después del cierre no hay avisos y las ventanas son estables", () => {
    expect(types("2026-03-29")).toEqual([]);
    const a = senacsaReminders(all, "2026-02-05")[0]!;
    const b = senacsaReminders(all, "2026-02-10")[0]!;
    expect(a).toEqual(b);
  });
  it("ventana de consulta y fecha de plan", () => {
    expect(senacsaReminderWindow(all, "2026-01-01")).toBe(false);
    expect(senacsaReminderWindow(all, "2026-02-10")).toBe(true);
    expect(senacsaReminderWindow(all, "2026-07-01")).toBe(false);
    expect(senacsaPlanDate(all[0]!, "2026-01-10")).toBe("2026-02-17");
    expect(senacsaPlanDate(all[0]!, "2026-03-01")).toBe("2026-03-01");
  });
});
