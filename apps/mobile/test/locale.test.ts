import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, getLocale, setLocale, t } from "@yvy/shared";
import type { Kv } from "../src/lib/forecast";
import { chooseLocale, loadLocale, readLocale } from "../src/lib/locale";

const memKv = (): Kv => {
  const m = new Map<string, string>();
  return { getKv: (k) => m.get(k) ?? null, setKv: (k, v) => void (v === null ? m.delete(k) : m.set(k, v)) };
};

afterEach(() => setLocale(DEFAULT_LOCALE));

describe("idioma de la app (U-22)", () => {
  it("sin elección usa es-PY; ignora un valor guardado que no es un idioma", () => {
    const kv = memKv();
    expect(readLocale(kv)).toBe("es-PY");
    kv.setKv("locale", "klingon");
    expect(loadLocale(kv)).toBe("es-PY");
  });

  it("la elección queda guardada sin señal y se recupera al abrir la app", () => {
    const kv = memKv();
    chooseLocale(kv, "gn-PY");
    expect(t("app.annotate")).toBe("Ehai");
    setLocale("es-PY"); // la app se cierra y se vuelve a abrir
    expect(loadLocale(kv)).toBe("gn-PY");
    expect(getLocale()).toBe("gn-PY");
  });

  it("la pantalla Anotar cae a es-PY en lo que no está traducido", () => {
    setLocale("gn-PY");
    expect(t("app.whatHappened")).toBe("¿Mba'e rehaíta?");
    expect(t("app.supplementTypeQuestion")).toBe("¿Qué le diste al ganado?");
  });
});
