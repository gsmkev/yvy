/** Pedido de prueba desde la landing: ruta pública, tope por conexión, campo trampa, validación y panel interno. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { normalizePhone } from "../src/routes/trial-requests";
import { call, createOrgWithOwner, createStaff, db } from "./helpers";

let n = 0;
const ask = (over: Record<string, unknown> = {}, ip = `10.1.0.${++n}`) =>
  call<any>("POST", "/public/trial-requests", {
    body: {
      name: `Ana ${n}`,
      whatsapp: "0981 123 456",
      company: "Estancia Ñandú",
      crops: ["Soja", "Ganadería"],
      hectares: "1.200",
      employees: "8",
      department: "Alto Paraná",
      consent: true,
      ...over,
    },
    headers: { "CF-Connecting-IP": ip },
  });
const rows = () => db().select().from(s.trialRequests);

describe("pedido de prueba de la landing", () => {
  it("guarda el pedido con consentimiento, teléfono normalizado y la IP solo como hash", async () => {
    const r = await ask({ name: "Ramona Giménez" });
    expect(r.status).toBe(200);
    const [row] = (await rows()).filter((x) => x.name === "Ramona Giménez");
    expect(row).toMatchObject({
      whatsapp: "595981123456",
      company: "Estancia Ñandú",
      hectares: 1200,
      employees: 8,
      department: "Alto Paraná",
      status: "new",
      consentVersion: "2026-11",
    });
    expect(JSON.parse(row!.crops)).toEqual(["Soja", "Ganadería"]);
    expect(row!.consentAt).toBeGreaterThan(0);
    expect(row!.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("solo pide nombre y WhatsApp: lo demás es opcional", async () => {
    const r = await ask({ name: "Solo Nombre", company: undefined, crops: undefined, hectares: "", employees: "", department: undefined });
    expect(r.status).toBe(200);
    const [row] = (await rows()).filter((x) => x.name === "Solo Nombre");
    expect(row).toMatchObject({ company: null, hectares: null, employees: null, department: null, crops: "[]" });
  });

  it("sin consentimiento, sin nombre, con teléfono inválido o números absurdos: 400 y nada guardado", async () => {
    const before = (await rows()).length;
    expect((await ask({ consent: false })).status).toBe(400);
    expect((await ask({ consent: undefined })).status).toBe(400);
    expect((await ask({ name: "  " })).status).toBe(400);
    expect((await ask({ whatsapp: "12345" })).status).toBe(400);
    expect((await ask({ whatsapp: "abc def ghi" })).status).toBe(400);
    expect((await ask({ hectares: "-4" })).status).toBe(400);
    expect((await ask({ employees: "2,5" })).status).toBe(400);
    expect((await ask({ crops: Array.from({ length: 20 }, (_, i) => `c${i}`) })).status).toBe(400);
    expect((await rows()).length).toBe(before);
  });

  it("el campo trampa responde igual y no guarda", async () => {
    const before = (await rows()).length;
    expect((await ask({ website: "http://spam" })).status).toBe(200);
    expect((await rows()).length).toBe(before);
  });

  it("tope por conexión: el sexto pedido del día es 429", async () => {
    const ip = "203.0.113.77";
    for (let i = 0; i < 5; i++) expect((await ask({ name: `Tope ${i}` }, ip)).status).toBe(200);
    expect((await ask({ name: "Tope 9" }, ip)).status).toBe(429);
    // otra conexión sigue pudiendo
    expect((await ask({ name: "Tope otra" }, "203.0.113.78")).status).toBe(200);
  });

  it("normaliza números paraguayos con y sin código de país", () => {
    expect(normalizePhone("+595 981 123 456")).toBe("595981123456");
    expect(normalizePhone("0981123456")).toBe("595981123456");
    expect(normalizePhone("981123456")).toBe("595981123456");
    expect(normalizePhone("(021) 123 456")).toBe("59521123456");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("1234567890123")).toBeNull();
  });
});

describe("pedidos de prueba en el panel interno", () => {
  it("solo el equipo los ve; el resto recibe 401 o 403", async () => {
    const owner = await createOrgWithOwner();
    expect((await call("GET", "/admin/trial-requests")).status).toBe(401);
    expect((await call("GET", "/admin/trial-requests", { token: owner.token })).status).toBe(403);
    expect((await call("POST", "/admin/trial-requests/x/contacted", { token: owner.token })).status).toBe(403);
  });

  it("lista los nuevos primero, sin datos de conexión, y los marcados como atendidos salen de la lista", async () => {
    const staff = await createStaff();
    await ask({ name: "Para Marcar" });
    const list = await call<any[]>("GET", "/admin/trial-requests", { token: staff.token });
    expect(list.status).toBe(200);
    const mine = list.body.find((x) => x.name === "Para Marcar")!;
    expect(mine).toMatchObject({ whatsapp: "595981123456", crops: ["Soja", "Ganadería"], status: "new" });
    expect(JSON.stringify(list.body)).not.toContain("ipHash");

    expect((await call("POST", `/admin/trial-requests/${mine.id}/contacted`, { token: staff.token })).status).toBe(200);
    const [row] = await db().select().from(s.trialRequests).where(eq(s.trialRequests.id, mine.id));
    expect(row).toMatchObject({ status: "contacted" });
    expect(row!.contactedAt).toBeGreaterThan(0);
    const after = await call<any[]>("GET", "/admin/trial-requests", { token: staff.token });
    expect(after.body.some((x) => x.id === mine.id)).toBe(false);
    const all = await call<any[]>("GET", "/admin/trial-requests?status=all", { token: staff.token });
    expect(all.body.some((x) => x.id === mine.id)).toBe(true);
    expect((await call("POST", "/admin/trial-requests/no-existe/contacted", { token: staff.token })).status).toBe(404);
  });
});
