/** E-06: tipo de cambio diario. Se usa el último hasta la fecha del movimiento. */
import { describe, expect, it } from "vitest";
import { rateOn, toMinor, toPyg } from "@yvy/shared";
import { call, createOrgWithOwner } from "./helpers";
import { getDb } from "../src/db/client";
import { env } from "cloudflare:test";
import { ScopedDb } from "../src/db/scoped";
import { usdRateOn } from "../src/db/erp";
import { erpGet, erpSetup, expectListStatus } from "./erp-helpers";

const put = (token: string, date: string, usdToPyg: number) =>
  call("PUT", `/org/erp/exchange-rates/${date}`, { token, body: { usdToPyg } });

describe("tipo de cambio (E-06)", () => {
  it("una fila por día: cargar de nuevo el mismo día lo reemplaza; lista del más nuevo al más viejo", async () => {
    const { owner } = await erpSetup();
    expect((await put(owner.token, "2026-11-01", 7300)).status).toBe(200);
    expect((await put(owner.token, "2026-11-05", 7350)).status).toBe(200);
    expect((await put(owner.token, "2026-11-01", 7310)).status).toBe(200);
    const list = await erpGet<any[]>(owner.token, "exchange-rates");
    expect(list.body).toEqual([
      { date: "2026-11-05", usdToPyg: 7350 },
      { date: "2026-11-01", usdToPyg: 7310 },
    ]);
    expect((await call("DELETE", "/org/erp/exchange-rates/2026-11-05", { token: owner.token })).status).toBe(200);
    expect((await call("DELETE", "/org/erp/exchange-rates/2026-11-05", { token: owner.token })).status).toBe(404);
  });

  it("valida fecha y valor", async () => {
    const { owner } = await erpSetup();
    expect((await put(owner.token, "ayer", 7300)).status).toBe(400);
    expect((await put(owner.token, "2026-11-01", 0)).status).toBe(400);
    expect((await put(owner.token, "2026-11-01", 7300.5)).status).toBe(400);
  });

  it("solo dueño y administrador; cada organización tiene el suyo", async () => {
    const { owner, admin, agro, worker } = await erpSetup();
    expect((await put(admin.token, "2026-11-01", 7300)).status).toBe(200);
    expect((await put(agro.token, "2026-11-02", 7300)).status).toBe(403);
    expect((await put(worker.token, "2026-11-02", 7300)).status).toBe(403);
    expect((await call("DELETE", "/org/erp/exchange-rates/2026-11-01", { token: agro.token })).status).toBe(403);
    await expectListStatus("exchange-rates", { agro: [agro.token, 403], worker: [worker.token, 403] });
    const other = await createOrgWithOwner("Otra");
    expect((await erpGet<any[]>(other.token, "exchange-rates")).body).toEqual([]);
    expect((await erpGet<any[]>(owner.token, "exchange-rates")).body).toHaveLength(1);
  });

  it("usdRateOn: el último hasta el día; si todos son posteriores, el más antiguo; sin ninguno, null", async () => {
    const { owner } = await erpSetup();
    const sdb = new ScopedDb(getDb(env.DB), { userId: owner.userId, orgId: owner.orgId, role: "owner" });
    expect(await usdRateOn(sdb, "2026-11-10")).toBeNull();
    await put(owner.token, "2026-11-01", 7300);
    await put(owner.token, "2026-11-05", 7350);
    expect(await usdRateOn(sdb, "2026-11-04")).toBe(7300);
    expect(await usdRateOn(sdb, "2026-11-09")).toBe(7350);
    expect(await usdRateOn(sdb, "2026-10-01")).toBe(7300);
  });
});

describe("dinero en unidad menor", () => {
  it("convierte a la unidad menor y a guaraníes", () => {
    expect(toMinor(125.5, "USD")).toBe(12550);
    expect(toMinor(1250000, "PYG")).toBe(1250000);
    expect(toPyg(12550, "USD", 7300)).toBe(916150);
    expect(toPyg(5000, "PYG", null)).toBe(5000);
    expect(toPyg(100, "USD", null)).toBeNull();
  });
  it("rateOn elige el último hasta la fecha", () => {
    const rates = [
      { date: "2026-11-05", usdToPyg: 7350 },
      { date: "2026-11-01", usdToPyg: 7300 },
    ];
    expect(rateOn(rates, "2026-11-03")).toBe(7300);
    expect(rateOn(rates, "2026-12-01")).toBe(7350);
    expect(rateOn(rates, "2026-10-01")).toBe(7300);
    expect(rateOn([], "2026-10-01")).toBeNull();
  });
});
