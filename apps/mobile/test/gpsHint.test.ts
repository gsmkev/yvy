import { describe, expect, it } from "vitest";
import { t } from "@yvy/shared";
import { gpsHintText, gpsStage, GPS_COLD_MS, GPS_SLOW_MS } from "../src/lib/gpsHint";

describe("aviso de GPS lento", () => {
  it("pasa de buscando a lento y a arranque en frío", () => {
    expect(gpsStage(0)).toBe("searching");
    expect(gpsStage(GPS_SLOW_MS - 1)).toBe("searching");
    expect(gpsStage(GPS_SLOW_MS)).toBe("slow");
    expect(gpsStage(GPS_COLD_MS)).toBe("cold");
  });
  it("explica que no necesita internet y no dice nada al principio", () => {
    expect(gpsHintText("searching")).toBeNull();
    expect(gpsHintText("slow")).toBe(t("app.gps.slowHint"));
    expect(gpsHintText("cold")).toBe(t("app.gps.coldHint"));
    expect(t("app.gps.coldHint")).toMatch(/internet/);
    expect(t("app.gps.noneHint")).toMatch(/internet/);
  });
});
