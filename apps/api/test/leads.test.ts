/** V-04: informe gratis de riesgo climático a cambio del email. */
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as s from "@yvy/shared/schema";
import { SystemDb } from "../src/db/system";
import { hmacHex } from "../src/lib/crypto";
import { call, db } from "./helpers";

const signed = async (method: string, path: string, body = "", ts = Date.now()) => ({
  "x-yvy-timestamp": String(ts),
  "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
});

const report = () => ({
  version: 1,
  generatedAt: Date.now(),
  normalFrom: 1991,
  normalTo: 2020,
  frost: { thresholdC: 2, perYear: [{ year: 1991, days: 4 }], meanPerYear: 4, worst: { year: 1991, days: 4 }, yearsWithFrostPct: 50, typicalFirstFrost: "06-20", typicalLastFrost: "08-10" },
  rain: { annualMeanMm: 1500, normal: [{ month: 1, meanMm: 150, p20Mm: 90, p80Mm: 200 }], recent: [{ month: "2026-10", mm: 120 }] },
  dry: { thresholdMm: 1, meanLongestDays: 18, worst: { year: 1995, days: 40 }, spells15PerYear: 0.8, summerMeanLongestDays: 14 },
  fire: null,
});

let n = 0;
const ask = (over: Record<string, unknown> = {}, ip = `10.0.0.${++n}`) =>
  call<any>("POST", "/public/leads", {
    body: { email: `Ana${n}@Ejemplo.com`, lon: -55.9, lat: -27.3, consent: true, ...over },
    headers: { "CF-Connecting-IP": ip },
  });
const rows = () => db().select().from(s.leads);

describe("pedido del informe gratis", () => {
  it("guarda el pedido con consentimiento, email en minúsculas y punto a 4 decimales", async () => {
    const r = await ask({ email: "Ana.Rojas@Ejemplo.com", lon: -55.912345, lat: -27.398765 });
    expect(r.status).toBe(200);
    const [row] = (await rows()).filter((x) => x.email === "ana.rojas@ejemplo.com");
    expect(row).toMatchObject({ lon: -55.9123, lat: -27.3988, status: "pending", consentVersion: "2026-11", attempts: 0 });
    expect(row!.consentAt).toBeGreaterThan(0);
    expect(row!.ipHash).toMatch(/^[0-9a-f]{64}$/); // la IP no se guarda en claro
  });

  it("sin consentimiento explícito, fuera de Paraguay o con email inválido: 400 y nada guardado", async () => {
    const before = (await rows()).length;
    expect((await ask({ consent: false })).status).toBe(400);
    expect((await ask({ consent: undefined })).status).toBe(400);
    expect((await ask({ lon: -58.4, lat: -34.6 })).status).toBe(400); // Buenos Aires
    expect((await ask({ email: "no-es-email" })).status).toBe(400);
    expect((await rows()).length).toBe(before);
  });

  it("el campo trampa responde igual y no guarda", async () => {
    const before = (await rows()).length;
    expect((await ask({ website: "http://spam" })).status).toBe(200);
    expect((await rows()).length).toBe(before);
  });

  it("tope por conexión: el cuarto pedido del día es 429", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < 3; i++) expect((await ask({ email: `tope${i}@ejemplo.com` }, ip)).status).toBe(200);
    expect((await ask({ email: "tope9@ejemplo.com" }, ip)).status).toBe(429);
  });

  it("el mismo email dentro de la semana recibe la misma respuesta sin pedido nuevo", async () => {
    await ask({ email: "repetido@ejemplo.com" });
    const before = (await rows()).filter((x) => x.email === "repetido@ejemplo.com").length;
    expect((await ask({ email: "Repetido@ejemplo.com" })).status).toBe(200);
    expect((await rows()).filter((x) => x.email === "repetido@ejemplo.com").length).toBe(before);
  });
});

describe("el job genera el informe", () => {
  it("lista los pendientes sin el email, guarda el informe, lo manda y el enlace lo muestra", async () => {
    await ask({ email: "job@ejemplo.com", lon: -56.1, lat: -26.9 });
    const list = await call<any[]>("GET", "/ingest/leads", { headers: await signed("GET", "/ingest/leads") });
    expect(list.status).toBe(200);
    const mine = list.body.find((x) => x.lon === -56.1)!;
    expect(mine).toEqual({ id: expect.any(String), lon: -56.1, lat: -26.9 });
    expect(JSON.stringify(list.body)).not.toContain("@");

    const path = `/ingest/leads/${mine.id}/report`;
    const body = JSON.stringify({ report: report() });
    const res = await call<any>("POST", path, { body, headers: await signed("POST", path, body) });
    expect(res.body).toEqual({ ok: true, sent: true });
    const [row] = await db().select().from(s.leads).where(eq(s.leads.id, mine.id));
    expect(row).toMatchObject({ status: "sent", attempts: 1 });
    expect(row!.sentAt).toBeGreaterThan(0);

    // ya enviado: sale de la lista de pendientes
    const again = await call<any[]>("GET", "/ingest/leads", { headers: await signed("GET", "/ingest/leads") });
    expect(again.body.find((x) => x.id === mine.id)).toBeUndefined();

    // el enlace del informe lleva la firma del id
    const sig = await hmacHex(env.JWT_SECRET, `lead:${mine.id}`);
    const view = await call<any>("GET", `/public/leads/${mine.id}/${sig}`);
    expect(view.status).toBe(200);
    expect(view.body.report.frost.meanPerYear).toBe(4);
    expect(JSON.stringify(view.body)).not.toContain("@");
    expect((await call("GET", `/public/leads/${mine.id}/${"0".repeat(64)}`)).status).toBe(404);
  });

  it("exige firma, forma válida y pedido existente", async () => {
    const id = "0190f0e0-0000-7000-8000-000000000000";
    const body = JSON.stringify({ report: report() });
    expect((await call("POST", `/ingest/leads/${id}/report`, { body })).status).toBe(401);
    const path = `/ingest/leads/${id}/report`;
    expect((await call("POST", path, { body, headers: await signed("POST", path, body) })).status).toBe(404);
    const bad = JSON.stringify({ report: { version: 2 } });
    expect((await call("POST", path, { body: bad, headers: await signed("POST", path, bad) })).status).toBe(400);
  });

  it("el mantenimiento borra el email y el informe pasada la retención", async () => {
    await ask({ email: "viejo@ejemplo.com" });
    await db().update(s.leads).set({ createdAt: Date.now() - 91 * 86_400_000 }).where(eq(s.leads.email, "viejo@ejemplo.com"));
    await new SystemDb(db()).purgeExpiredAuth(Date.now());
    expect((await rows()).filter((x) => x.email === "viejo@ejemplo.com")).toHaveLength(0);
  });
});
