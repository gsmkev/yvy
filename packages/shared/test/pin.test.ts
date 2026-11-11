import { describe, expect, it } from "vitest";
import { isWeakPin, phoneKey } from "../src/pin";

describe("phoneKey", () => {
  it("unifica los formatos paraguayos", () => {
    const k = "595981123456";
    expect(phoneKey("0981 123 456")).toBe(k);
    expect(phoneKey("+595 981 123 456")).toBe(k);
    expect(phoneKey("595981123456")).toBe(k);
    expect(phoneKey("981123456")).toBe(k);
    expect(phoneKey("(0981) 123-456")).toBe(k);
    expect(phoneKey("00595981123456")).toBe(k);
  });
  it("respeta otros países con +", () => {
    expect(phoneKey("+54 9 11 5555 1234")).toBe("5491155551234");
  });
  it("rechaza lo que no es un teléfono", () => {
    expect(phoneKey("")).toBeNull();
    expect(phoneKey("abc")).toBeNull();
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey("1".repeat(20))).toBeNull();
  });
});

describe("isWeakPin", () => {
  it("rechaza repetidos y escaleras", () => {
    for (const p of ["000000", "111111", "123456", "654321", "345678"]) expect(isWeakPin(p)).toBe(true);
  });
  it("rechaza lo que no son 6 dígitos", () => {
    for (const p of ["12345", "1234567", "12345a", ""]) expect(isWeakPin(p)).toBe(true);
  });
  it("acepta un PIN común no trivial", () => {
    for (const p of ["483920", "120120", "908172"]) expect(isWeakPin(p)).toBe(false);
  });
});
