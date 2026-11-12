import { describe, expect, it } from "vitest";
import { FIELD_ID } from "@yvy/shared";
import { fieldIdFrom } from "../routes/forms";

describe("ids de campos propios (F-14)", () => {
  it("salen de la etiqueta, sin tildes ni símbolos, y siempre cumplen el formato", () => {
    expect(fieldIdFrom("Altura de plantas (cm)", [])).toBe("altura_de_plantas_cm");
    expect(fieldIdFrom("¿Regó el lote?", [])).toBe("rego_el_lote");
    expect(fieldIdFrom("2da pasada", [])).toBe("c_2da_pasada");
    expect(fieldIdFrom("???", [])).toBe("campo");
    for (const l of ["Ñandú", "x".repeat(80), "A", "1"]) expect(FIELD_ID.test(fieldIdFrom(l, []))).toBe(true);
  });

  it("no repite ids dentro del mismo tipo de registro", () => {
    expect(fieldIdFrom("Viento", ["viento"])).toBe("viento_2");
    expect(fieldIdFrom("Viento", ["viento", "viento_2"])).toBe("viento_3");
  });
});
