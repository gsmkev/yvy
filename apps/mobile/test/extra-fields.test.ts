import { describe, expect, it } from "vitest";
import { flattenExtra, parseRecordData, splitExtraAnswers, type FormField } from "@yvy/shared";
import { extraSteps, FLOWS, RAW, stepsFor } from "../src/lib/annotate";
import { fieldsFor, readFormConfig, refreshFormConfig } from "../src/lib/formConfig";

const fields: FormField[] = [
  { id: "viento", label: "Viento", type: "choice", options: ["calmo", "fuerte"], required: true },
  { id: "altura", label: "Altura", type: "number", unit: "cm" },
  { id: "riego", label: "¿Regado?", type: "yesno" },
  { id: "obs", label: "Observación", type: "text" },
];

const kv = () => {
  const m = new Map<string, string>();
  return { getKv: (k: string) => m.get(k) ?? null, setKv: (k: string, v: string | null) => void (v === null ? m.delete(k) : m.set(k, v)) };
};

describe("F-14 · campos propios en el flujo de anotar", () => {
  it("se preguntan después de las estándar, con textos escritos por la organización", () => {
    const steps = stepsFor("scouting", {}, { waterPois: 0, extraFields: fields });
    const std = FLOWS.scouting.length;
    expect(steps).toHaveLength(std + fields.length);
    expect(steps.slice(0, std).map((s) => s.key)).toEqual(FLOWS.scouting.map((s) => s.key));
    expect(steps.slice(std).map((s) => s.key)).toEqual(["extra.viento", "extra.altura", "extra.riego", "extra.obs"]);
    const [viento, altura, riego, obs] = steps.slice(std);
    expect(viento).toMatchObject({ kind: "choice", question: `${RAW}Viento`, optional: false, options: [{ value: "calmo", label: `${RAW}calmo` }, { value: "fuerte", label: `${RAW}fuerte` }] });
    expect(altura).toMatchObject({ kind: "number", unit: "cm", optional: true });
    expect(riego).toMatchObject({ kind: "yesno" });
    expect(obs).toMatchObject({ kind: "text", optional: true });
  });

  it("sin campos propios el flujo es el de siempre", () => {
    expect(stepsFor("rain", {})).toEqual(FLOWS.rain);
    expect(extraSteps(undefined)).toEqual([]);
  });

  it("las respuestas pasan a data.extra, validan con el esquema genérico y se precargan al editar", () => {
    const values = { condition: "good", note: "ok", "extra.viento": "fuerte", "extra.altura": 12.5, "extra.riego": true, "extra.obs": "" };
    const { rest, extra } = splitExtraAnswers(values);
    const parsed = parseRecordData("scouting", { ...rest, ...(extra ? { extra } : {}) });
    expect(parsed.success && parsed.data).toEqual({ condition: "good", note: "ok", extra: { viento: "fuerte", altura: 12.5, riego: true } });
    expect(flattenExtra(parsed.success ? (parsed.data as Record<string, unknown>) : {})).toMatchObject({ "extra.viento": "fuerte", "extra.altura": 12.5 });
  });

  it("la configuración se guarda en el celular, se valida y sobrevive sin red", async () => {
    const db = kv();
    expect(readFormConfig(db)).toEqual({});
    await refreshFormConfig(db, async () => ({ config: { scouting: fields } }));
    expect(fieldsFor(readFormConfig(db), "scouting").map((f) => f.id)).toEqual(["viento", "altura", "riego", "obs"]);
    expect(fieldsFor(readFormConfig(db), "rain")).toEqual([]);
    expect(fieldsFor(readFormConfig(db), null)).toEqual([]);
    // sin red queda lo último; una respuesta inválida del servidor no pisa lo bueno
    await refreshFormConfig(db, async () => {
      throw new TypeError("Network request failed");
    });
    await refreshFormConfig(db, async () => ({ config: { scouting: [{ id: "MAL", label: "x", type: "text" }] } }));
    expect(fieldsFor(readFormConfig(db), "scouting")).toHaveLength(4);
    // un dato local roto no tumba el flujo
    db.setKv("form_config", "{no es json");
    expect(readFormConfig(db)).toEqual({});
  });
});
