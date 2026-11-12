import { describe, expect, it } from "vitest";
import { t } from "@yvy/shared";
import config, { SHORTCUT_LABELS } from "../app.config";
import { shortcutsXml, rainKeys, RAIN_URI } from "../plugins/shortcuts-xml";

describe("F-11 · atajo de Android para anotar lluvia", () => {
  it("los textos de la config salen de i18n", () => {
    expect(SHORTCUT_LABELS.rainShort).toBe(t("app.shortcutRainShort"));
    expect(SHORTCUT_LABELS.rainLong).toBe(t("app.shortcutRainLong"));
  });

  it("el plugin está registrado con esos textos", () => {
    expect(config.plugins).toContainEqual(["./plugins/android-shortcuts", SHORTCUT_LABELS]);
  });

  it("el XML abre la anotación de lluvia de la estancia dentro de la app", () => {
    const xml: string = shortcutsXml({ packageName: "py.com.koeti.yvy", className: "py.com.koeti.yvy.MainActivity" });
    expect(RAIN_URI).toBe("yvy://annotate?kind=rain&farmLevel=1");
    expect(xml).toContain('android:data="yvy://annotate?kind=rain&amp;farmLevel=1"');
    expect(xml).toContain('android:targetPackage="py.com.koeti.yvy"');
    expect(xml).toContain(`@string/${rainKeys.short}`);
    expect(xml).toContain(`@string/${rainKeys.long}`);
  });
});
