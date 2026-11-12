import { describe, expect, it } from "vitest";
import config, { updatesConfig } from "../app.config";

describe("P-31 · actualizaciones sin tienda", () => {
  it("sin EAS_UPDATE_URL quedan apagadas", () => {
    expect(updatesConfig({})).toEqual({ enabled: false });
    expect(updatesConfig({ EAS_UPDATE_URL: "" })).toEqual({ enabled: false });
  });

  it("con EAS_UPDATE_URL se activan y buscan al abrir la app sin demorar el arranque", () => {
    expect(updatesConfig({ EAS_UPDATE_URL: "https://u.expo.dev/abc" })).toEqual({
      url: "https://u.expo.dev/abc",
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    });
  });

  it("la versión de ejecución sigue a la versión de la app", () => {
    expect(config.runtimeVersion).toEqual({ policy: "appVersion" });
  });
});
