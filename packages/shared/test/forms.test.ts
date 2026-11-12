import { describe, expect, it } from "vitest";
import { describeExtra, extraSchema, flattenExtra, formConfigSchema, missingRequired, parseRecordData, splitExtraAnswers, type FormField } from "../src";

const fields: FormField[] = [
  { id: "viento", label: "Viento", type: "choice", options: ["calmo", "fuerte"], required: true },
  { id: "altura", label: "Altura", type: "number", unit: "cm" },
  { id: "riego", label: "¿Regado?", type: "yesno" },
];

describe("F-14 · campos propios", () => {
  it("las respuestas se separan del resto y vuelven a aplanarse al editar", () => {
    const { rest, extra } = splitExtraAnswers({ condition: "good", "extra.viento": "calmo", "extra.altura": 30, "extra.riego": false, "extra.vacio": "" });
    expect(rest).toEqual({ condition: "good" });
    expect(extra).toEqual({ viento: "calmo", altura: 30, riego: false });
    expect(flattenExtra({ condition: "good", extra })).toEqual({ condition: "good", "extra.viento": "calmo", "extra.altura": 30, "extra.riego": false });
    expect(splitExtraAnswers({ a: 1 }).extra).toBeUndefined();
  });

  it("describe las respuestas con la etiqueta y conserva las de campos que ya no existen", () => {
    expect(describeExtra(fields, { viento: "fuerte", altura: 12, riego: true, viejo: "dato" })).toEqual([
      { label: "Viento", value: "fuerte" },
      { label: "Altura", value: "12 cm" },
      { label: "¿Regado?", value: "Sí" },
      { label: "viejo", value: "dato" },
    ]);
    expect(describeExtra(fields, undefined)).toEqual([]);
  });

  it("detecta las obligatorias que faltan", () => {
    expect(missingRequired(fields, { altura: 1 }).map((f) => f.id)).toEqual(["viento"]);
    expect(missingRequired(fields, { viento: "calmo" })).toEqual([]);
    expect(missingRequired(undefined, undefined)).toEqual([]);
  });

  it("el esquema genérico y parseRecordData aceptan extra válido y lo rechazan inválido", () => {
    expect(extraSchema.safeParse({ ok_1: "x", n: 2, b: true }).success).toBe(true);
    expect(extraSchema.safeParse({ "No válida": 1 }).success).toBe(false);
    expect(extraSchema.safeParse({ a: null }).success).toBe(false);
    const good = parseRecordData("scouting", { condition: "good", extra: { n: 3 } });
    expect(good.success && (good.data as { extra?: unknown }).extra).toEqual({ n: 3 });
    expect(parseRecordData("scouting", { condition: "good", extra: { n: [] } }).success).toBe(false);
    expect(parseRecordData("scouting", { condition: "bad" }).success).toBe(true);
    expect(parseRecordData("scouting", { condition: "rara", extra: { n: 1 } }).success).toBe(false);
  });

  it("la configuración exige opciones en las preguntas de opciones y ids únicos", () => {
    expect(formConfigSchema.safeParse({ rain: fields }).success).toBe(true);
    expect(formConfigSchema.safeParse({ rain: [{ id: "a", label: "A", type: "choice" }] }).success).toBe(false);
    expect(formConfigSchema.safeParse({ rain: [fields[1], fields[1]] }).success).toBe(false);
  });
});
