import { describe, expect, it } from "vitest";
import { alertShareText, mapsLink, recordShareText, weeklyShareText, whatsappUrl } from "@yvy/shared";

describe("compartir por WhatsApp", () => {
  it("resumen de un registro con lote, estancia y enlace de Google Maps", () => {
    const text = recordShareText({
      kindLabel: "Plaga o enfermedad",
      description: "Chinche, 3 por metro",
      plotName: "Lote 1",
      farmName: "La Esperanza",
      when: "10 nov, 08:30",
      lat: -27.2,
      lon: -55.9,
    });
    expect(text).toContain("Chinche, 3 por metro");
    expect(text).toContain("Lote: Lote 1");
    expect(text).toContain("Estancia: La Esperanza");
    expect(text).toContain(mapsLink(-27.2, -55.9));
  });

  it("sin punto no agrega ubicación", () => {
    expect(recordShareText({ kindLabel: "Nota", description: "x", when: "hoy" })).not.toContain("google.com");
  });

  it("la URL de wa.me codifica el texto", () => {
    expect(whatsappUrl("a b\nc&d")).toBe("https://wa.me/?text=a%20b%0Ac%26d");
  });

  it("aviso y parte semanal llevan el enlace a la app", () => {
    const a = alertShareText({
      kindLabel: "Helada",
      severityLabel: "Alerta",
      summary: "Posible helada",
      validity: "Del 10 al 11",
      link: "https://app/avisos",
    });
    expect(a).toContain("https://app/avisos");
    const w = weeklyShareText({
      farmName: "La Esperanza",
      from: "01/11/2026",
      to: "08/11/2026",
      records: 4,
      workers: 2,
      rainMm: 12.4,
      alerts: [],
      link: "https://app/parte",
    });
    expect(w).toContain("12 mm");
    expect(w).toContain("https://app/parte");
  });
});
