import { describe, expect, it } from "vitest";
import { campaignCount, campaignDayLabel, campaignLabel, campaignStartYear, dayOfCampaign, groupCampaigns } from "./vigorSeasons";

const d = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

describe("campañas de vigor (S-03)", () => {
  it("la campaña va de julio a junio", () => {
    expect(campaignStartYear(d("2024-07-01"))).toBe(2024);
    expect(campaignStartYear(d("2025-06-30"))).toBe(2024);
    expect(campaignStartYear(d("2025-01-15"))).toBe(2024);
    expect(campaignLabel(2024)).toBe("2024/25");
    expect(campaignLabel(2099)).toBe("2099/00");
    expect(dayOfCampaign(d("2024-07-01"))).toBe(0);
    expect(dayOfCampaign(d("2024-07-11"))).toBe(10);
  });

  it("agrupa por campaña, alinea por semana y deja las más nuevas primero", () => {
    const g = groupCampaigns([
      { acquiredAt: d("2023-11-02"), mean: 0.5 },
      { acquiredAt: d("2023-11-03"), mean: 0.7 }, // misma semana que la anterior: se promedian
      { acquiredAt: d("2024-11-03"), mean: 0.6 },
      { acquiredAt: d("2025-01-10"), mean: 0.8 },
    ]);
    expect(g.map((s) => s.label)).toEqual(["2024/25", "2023/24"]);
    expect(g[1]!.points).toHaveLength(1);
    expect(g[1]!.points[0]!.y).toBe(0.6);
    expect(g[0]!.points.map((p) => p.x)).toEqual([...g[0]!.points.map((p) => p.x)].sort((a, b) => a - b));
    expect(g[0]!.points.every((p) => p.x % 7 === 0)).toBe(true);
  });

  it("limita la cantidad de campañas y cuenta las que hay", () => {
    const pts = Array.from({ length: 9 }, (_, i) => ({ acquiredAt: d(`${2017 + i}-12-01`), mean: 0.5 }));
    expect(groupCampaigns(pts, 6)).toHaveLength(6);
    expect(groupCampaigns(pts, 6)[0]!.label).toBe("2025/26");
    expect(campaignCount(pts)).toBe(9);
    expect(campaignCount([])).toBe(0);
  });

  it("rotula los ejes con el mes", () => {
    expect(campaignDayLabel(0)).toMatch(/jul/i);
    expect(campaignDayLabel(185)).toMatch(/ene/i);
  });
});
