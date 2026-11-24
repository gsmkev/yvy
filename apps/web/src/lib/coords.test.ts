import { describe, expect, it } from "vitest";
import { parseLocation } from "./coords";

const close = (a: number | undefined, b: number) => expect(a).toBeCloseTo(b, 4);

describe("parseLocation", () => {
  it("decimales con coma, espacio o punto y coma", () => {
    for (const s of ["-25.28, -57.63", "-25.28,-57.63", "-25.28 -57.63", "-25.28; -57.63", " (-25.28, -57.63) "]) {
      const r = parseLocation(s);
      close(r?.lat, -25.28);
      close(r?.lon, -57.63);
    }
  });
  it("corrige lon, lat al revés", () => {
    const r = parseLocation("-57.63, -25.28");
    close(r?.lat, -25.28);
    close(r?.lon, -57.63);
  });
  it("grados, minutos y segundos", () => {
    const r = parseLocation(`25°16'59.2"S 57°38'03.5"W`);
    close(r?.lat, -(25 + 16 / 60 + 59.2 / 3600));
    close(r?.lon, -(57 + 38 / 60 + 3.5 / 3600));
  });
  it("DMS con hemisferio adelante, sin símbolos y con longitud primero", () => {
    expect(parseLocation(`S 25° 16' 59" W 57° 38' 3"`)?.lat).toBeLessThan(-25.2);
    expect(parseLocation("25 16 59 S 57 38 3 W")?.lon).toBeLessThan(-57.6);
    close(parseLocation(`57°38'W, 25°16'S`)?.lat, -(25 + 16 / 60));
  });
  it("enlaces de Google Maps", () => {
    const a = parseLocation("https://www.google.com/maps/@-25.2800,-57.6300,15z");
    close(a?.lat, -25.28);
    close(a?.lon, -57.63);
    const b = parseLocation("https://maps.google.com/?q=-25.28,-57.63");
    close(b?.lon, -57.63);
    const c = parseLocation("https://www.google.com/maps?q=-25.28%2C-57.63&z=17");
    close(c?.lat, -25.28);
    const d = parseLocation(
      "https://www.google.com/maps/place/Estancia/@-22.5,-55.7,12z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-22.55!4d-55.73",
    );
    close(d?.lat, -22.55);
    close(d?.lon, -55.73);
  });
  it("rechaza lo que no es una ubicación", () => {
    for (const s of ["", "hola", "123", "-195.28, -57.63", "95, 200", "https://maps.app.goo.gl/abc123"])
      expect(parseLocation(s)).toBeNull();
  });
});
