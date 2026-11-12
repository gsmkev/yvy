import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, getLocale, hasKey, isLocale, locales, setLocale, subscribeLocale, t } from "../src";

afterEach(() => setLocale(DEFAULT_LOCALE));

const flat = (tree: unknown, prefix = ""): Record<string, string> =>
  Object.entries(tree as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === "string") acc[`${prefix}${k}`] = v;
    else Object.assign(acc, flat(v, `${prefix}${k}.`));
    return acc;
  }, {});
const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("idiomas (U-22)", () => {
  it("por defecto es es-PY y reconoce solo los idiomas que existen", () => {
    expect(getLocale()).toBe("es-PY");
    expect(isLocale("gn-PY")).toBe(true);
    expect(isLocale("en")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("en guaraní traduce lo que tiene y lo demás cae a es-PY", () => {
    setLocale("gn-PY");
    expect(t("app.map")).toBe("Mapa");
    expect(t("app.yes")).toBe("Heẽ");
    expect(t("app.today")).toBe("Ko árape");
    // sin traducción: es-PY
    expect(t("app.logout")).toBe(flat(locales["es-PY"])["app.logout"]);
    // el idioma se puede pedir sin cambiar el activo
    expect(t("app.yes", {}, "es-PY")).toBe("Sí");
  });

  it("mantiene los marcadores {{x}} de es-PY", () => {
    setLocale("gn-PY");
    expect(t("app.savedTitle", { plot: "Lote 4" })).toBe("Ojehai Lote 4-pe");
  });

  it("cada texto en guaraní existe en es-PY y usa los mismos marcadores", () => {
    const es = flat(locales["es-PY"]);
    for (const [key, text] of Object.entries(flat(locales["gn-PY"]))) {
      expect(es[key], `la clave ${key} no existe en es-PY`).toBeDefined();
      expect(vars(text), key).toEqual(vars(es[key]!));
      expect(text.trim(), key).not.toBe("");
    }
  });

  it("avisa a quien escucha solo cuando el idioma cambia", () => {
    let n = 0;
    const off = subscribeLocale(() => n++);
    setLocale("gn-PY");
    setLocale("gn-PY");
    setLocale("es-PY");
    off();
    setLocale("gn-PY");
    expect(n).toBe(2);
  });

  it("hasKey mira es-PY, que tiene todas las claves", () => {
    expect(hasKey("app.logout")).toBe(true);
    expect(hasKey("app.noExiste")).toBe(false);
  });
});
