/** E-12: lote y vencimiento; lista de lo que vence en 30 días (FEFO). */
import { describe, expect, it } from "vitest";
import { addDays, localDate } from "@yvy/shared";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";

const today = () => localDate(Date.now());
const expiring = async (token: string) => (await erpGet<any[]>(token, "stock/expiring")).body;

describe("lotes y vencimientos (E-12)", () => {
  it("avisa los lotes que vencen en 30 días o ya vencieron; los lejanos y los sin fecha no", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000, { lot: "A-001", expiresOn: addDays(today(), 10) });
    await buy(s.owner.token, s, 100, 1_000_000, { lot: "B-002", expiresOn: addDays(today(), 90) });
    await buy(s.owner.token, s, 50, 500_000);
    await buy(s.owner.token, s, 20, 200_000, { lot: "OLD", expiresOn: addDays(today(), -3) });
    const list = await expiring(s.owner.token);
    expect(list.map((x) => [x.lot, x.daysLeft, x.remaining])).toEqual([
      ["OLD", -3, 20],
      ["A-001", 10, 100],
    ]);
  });

  it("lo consumido sale primero de lo que vence antes: al gastar el lote el aviso desaparece", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 100, 1_000_000, { lot: "A-001", expiresOn: addDays(today(), 10) });
    await buy(s.owner.token, s, 100, 1_000_000, { lot: "B-002", expiresOn: addDays(today(), 20) });
    const use = (qty: number) => erpPost(s.owner.token, "stock/consumptions", { productId: s.productId, warehouseId: s.whA, date: today(), qty });
    await use(30);
    expect((await expiring(s.owner.token)).map((x) => [x.lot, x.remaining])).toEqual([["A-001", 70], ["B-002", 100]]);
    await use(70);
    expect((await expiring(s.owner.token)).map((x) => [x.lot, x.remaining])).toEqual([["B-002", 100]]);
    await use(100);
    expect(await expiring(s.owner.token)).toEqual([]);
  });

  it("el agrónomo ve la lista; el empleado no; el vencimiento se valida", async () => {
    const s = await stockSetup();
    await buy(s.owner.token, s, 10, 100_000, { lot: "X", expiresOn: addDays(today(), 5) });
    const r = await erpGet<any[]>(s.agro.token, "stock/expiring");
    expect(r.status).toBe(200);
    expect(r.body[0]).toMatchObject({ lot: "X", remaining: 10 });
    expect(r.body[0]).not.toHaveProperty("valuePyg");
    expect((await erpGet(s.worker.token, "stock/expiring")).status).toBe(403);
    expect((await buy(s.owner.token, s, 1, 1, { expiresOn: "pronto" })).status).toBe(400);
  });
});
