import { describe, expect, it } from "vitest";
import { addContact, coordsText, emergencyText, normalizeContactPhone, parseContacts, smsUrl, whenText } from "../src/lib/emergencySms";

// 2026-11-12 17:32 UTC = 14:32 en Paraguay (UTC-3)
const AT = Date.UTC(2026, 10, 12, 17, 32);
const PY = 180;

describe("texto del SMS de emergencia (F-30)", () => {
  it("coordenadas a 5 decimales, precisión y hora local", () => {
    const body = emergencyText("Ramón Benítez", { lat: -25.281234, lon: -57.634567, accuracy: 8.4 }, AT, PY);
    expect(body).toContain("Ramón Benítez");
    expect(body).toContain("-25.28123, -57.63457");
    expect(body).toContain("± 8 m");
    expect(body).toContain("14:32 del 12/11");
    expect(body).toContain("https://maps.google.com/?q=-25.28123,-57.63457");
  });

  it("sin precisión informada lo dice, y sin ubicación igual sale con la hora", () => {
    expect(emergencyText("Ana", { lat: -25.1, lon: -57.2, accuracy: 0 }, AT, PY)).toContain("sin precisión");
    const none = emergencyText("Ana", null, AT, PY);
    expect(none).toContain("No pude tomar la ubicación");
    expect(none).toContain("14:32 del 12/11");
    expect(emergencyText("  ", null, AT, PY)).toContain("un compañero");
  });

  it("formatos auxiliares", () => {
    expect(coordsText({ lat: -25.5, lon: -57 })).toBe("-25.50000, -57.00000");
    expect(whenText(Date.UTC(2026, 0, 5, 3, 7), 0)).toBe("03:07 del 05/01");
  });
});

describe("enlace sms:", () => {
  it("Android: destinatarios con coma y cuerpo con ?body=", () => {
    expect(smsUrl(["+595981123456", "0971555666"], "Hola, ¿qué tal? & más", "android")).toBe(
      "sms:%2B595981123456,0971555666?body=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F%20%26%20m%C3%A1s",
    );
  });
  it("iOS: /open?addresses=…&body=…", () => {
    expect(smsUrl(["+595981123456"], "ayuda", "ios")).toBe("sms:/open?addresses=%2B595981123456&body=ayuda");
  });
  it("sin contactos abre el mensaje para elegir a quién mandarlo", () => {
    expect(smsUrl([], "x", "android")).toBe("sms:?body=x");
  });
});

describe("contactos de emergencia", () => {
  it("normaliza teléfonos y rechaza lo que no lo es", () => {
    expect(normalizeContactPhone("+595 981 123-456")).toBe("+595981123456");
    expect(normalizeContactPhone("(0971) 555 666")).toBe("0971555666");
    expect(normalizeContactPhone("12345")).toBeNull();
    expect(normalizeContactPhone("1234567890123456")).toBeNull();
    expect(normalizeContactPhone("hola")).toBeNull();
  });

  it("agrega sin repetidos y con tope de 5", () => {
    let list: ReturnType<typeof parseContacts> = [];
    for (let i = 0; i < 5; i++) {
      const r = addContact(list, `C${i}`, `09715556${i}0`);
      expect(r.ok).toBe(true);
      if (r.ok) list = r.list;
    }
    expect(addContact(list, "otro", "0971999888")).toEqual({ ok: false, reason: "full" });
    expect(addContact(list.slice(0, 1), "mismo", "0971 5556 00")).toEqual({ ok: false, reason: "duplicate" });
    expect(addContact([], "x", "abc")).toEqual({ ok: false, reason: "phone" });
  });

  it("lee lo guardado y tolera datos rotos", () => {
    expect(parseContacts(null)).toEqual([]);
    expect(parseContacts("no es json")).toEqual([]);
    expect(parseContacts('{"a":1}')).toEqual([]);
    expect(
      parseContacts(JSON.stringify([{ name: " Mamá ", phone: "+595 981 111 222" }, { name: "x", phone: "abc" }, { phone: "+595981111222" }, 7])),
    ).toEqual([{ name: "Mamá", phone: "+595981111222" }]);
  });
});
