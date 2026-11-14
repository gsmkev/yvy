import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS, locales } from "@yvy/shared";
import { attribution, audiences, comoSteps, datosRows, faq, imprevistoIndex, imprevistoMarks, L, reporteRows, tarifaRows, TRIAL_DAYS } from "./content";

/** Todos los textos del bloque `landing`, aplanados. */
const flat = (o: unknown, path = ""): [string, string][] =>
  typeof o === "string"
    ? [[path, o]]
    : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k));
const landing = (locales["es-PY"] as unknown as { landing: { meta: { title: string; description: string } } }).landing;
const texts = flat(landing);

describe("contenido de la landing", () => {
  it("no promete fuentes ni funciones que Yvy no tiene", () => {
    const banned = [/ERA5/i, /Sentinel-1/i, /GFS/, /NOAA/i, /Copernicus DEM/i, /humedad del suelo/i, /iOS/, /iPhone/i, /hola@/i, /hora por hora/i, /14 días/i, /ilimitados/i];
    for (const [key, text] of texts) for (const re of banned) expect(text, key).not.toMatch(re);
  });

  it("las fuentes son solo las permitidas, con la atribución de MET Norway", () => {
    const sources = datosRows().map((r) => r[0]);
    expect(sources).toEqual(["Sentinel-2 · Copernicus", "CHIRPS", "NASA POWER", "NASA FIRMS", "MET Norway"]);
    const credit = attribution(2026);
    expect(credit).toContain("Datos de MET Norway");
    expect(credit).not.toMatch(/ERA5|GFS|NOAA|Sentinel-1|DEM/);
  });

  it("los días de prueba son los del producto (LIMITS.trialDays), no un número suelto", () => {
    expect(TRIAL_DAYS).toBe(LIMITS.trialDays);
    expect(L("hero.cta", { days: TRIAL_DAYS })).toContain(`${LIMITS.trialDays} días`);
    expect(tarifaRows()[4]![0]).toContain(`${LIMITS.trialDays} días`);
    expect(texts.some(([, v]) => /\b30 días/.test(v) && !/últimos 30 días|Lluvia 30 D/.test(v))).toBe(false);
  });

  it("las listas numeradas están completas", () => {
    expect(comoSteps()).toHaveLength(4);
    expect(audiences()).toHaveLength(5);
    expect(faq()).toHaveLength(5);
    expect(imprevistoIndex()).toHaveLength(4);
    expect(imprevistoMarks()).toHaveLength(3);
    expect(reporteRows()).toHaveLength(5);
    const all = [...comoSteps().flatMap((s) => [s.t, s.d]), ...audiences().flatMap((a) => [a.n, a.g]), ...faq().flatMap((f) => [f.q, f.a])];
    for (const s of all) expect(s).toMatch(/\S/);
    for (const s of all) expect(s).not.toMatch(/^landing\.|undefined|\{\{/);
  });

  it("el título y la descripción del index.html coinciden con los de la landing", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain(`<meta name="description" content="${landing.meta.description}"`);
    expect(html).toContain(`<meta property="og:title" content="${landing.meta.title}"`);
    expect(html).toContain(`<meta property="og:description" content="${landing.meta.description}"`);
  });
});
