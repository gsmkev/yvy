import { describe, expect, it } from "vitest";
import { t } from "@yvy/shared";
import { gpsHintText, gpsStage, GPS_COLD_MS, GPS_SLOW_MS } from "../src/lib/gpsHint";

describe("F-01 aviso de GPS lento", () => {
  it("pasa de buscando a lento y a arranque en frío", () => {
    expect(gpsStage(0)).toBe("searching");
    expect(gpsStage(GPS_SLOW_MS - 1)).toBe("searching");
    expect(gpsStage(GPS_SLOW_MS)).toBe("slow");
    expect(gpsStage(GPS_COLD_MS)).toBe("cold");
  });
  it("explica que no necesita internet y no dice nada al principio", () => {
    expect(gpsHintText("searching")).toBeNull();
    expect(gpsHintText("slow")).toBe(t("app.gpsSlowHint"));
    expect(gpsHintText("cold")).toBe(t("app.gpsColdHint"));
    expect(t("app.gpsColdHint")).toMatch(/internet/);
    expect(t("app.gpsNoneHint")).toMatch(/internet/);
  });
});
