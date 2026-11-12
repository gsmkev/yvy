import { describe, expect, it } from "vitest";
import { poiQrPayload } from "@yvy/shared";
import { poiQrSheetHtml } from "./PoiQr";

const id = "0190b2c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d";

describe("hoja de QR de puntos (F-28)", () => {
  it("lleva una tarjeta por punto con su nombre y tipo", () => {
    const html = poiQrSheetHtml("Santa Rita", [{ id, name: "Bebedero norte", kind: "trough" }]);
    expect(html).toContain("Bebedero norte");
    expect(html).toContain("Santa Rita");
    expect(html.match(/<figure>/g)).toHaveLength(1);
    expect(html).toContain("<svg");
  });

  it("escapa los nombres: nada de HTML inyectado en la hoja", () => {
    const html = poiQrSheetHtml('<img src=x onerror=alert(1)>', [{ id, name: "<script>alert(1)</script>", kind: "other" }]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("el contenido del QR es el que entiende la app", () => {
    expect(poiQrPayload(id)).toBe(`yvy://poi?id=${id}`);
  });
});
