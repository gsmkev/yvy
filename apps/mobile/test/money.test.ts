import { describe, expect, it } from "vitest";
import { fmtGs, fmtMoney, fmtQty } from "../src/office/money";

describe("dinero en pantalla", () => {
  it("guaraníes enteros con punto de miles", () => {
    expect(fmtMoney(1250000, "PYG")).toBe("Gs. 1.250.000");
    expect(fmtGs(0)).toBe("Gs. 0");
    expect(fmtGs(-4500)).toBe("-Gs. 4.500");
  });
  it("dólares con centavos y coma", () => {
    expect(fmtMoney(12550, "USD")).toBe("US$ 125,50");
    expect(fmtMoney(123456789, "USD")).toBe("US$ 1.234.567,89");
  });
  it("cantidades con unidad", () => {
    expect(fmtQty(12.5, "l")).toBe("12,5 l");
    expect(fmtQty(3)).toBe("3");
  });
});
