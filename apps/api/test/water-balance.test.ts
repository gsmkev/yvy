import { describe, expect, it } from "vitest";
import { DAY, isoDay, seedClimate } from "./agri2-helpers";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

describe("C-08 · balance hídrico del lote", () => {
  it("resta el consumo del cultivo a la lluvia CHIRPS desde la siembra", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const plotId = plotIds[0]!;
    const from = Date.now() - 30 * DAY;
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { sowingDate: isoDay(from) } });
    await seedClimate(
      farmId,
      Array.from({ length: 30 }, (_, i) => ({ date: isoDay(from + i * DAY), source: "nasa_power", tminC: 24, tmaxC: 38 })),
    );
    // CHIRPS: 25 días sin lluvia; los últimos 5 días todavía no llegaron
    await seedClimate(
      farmId,
      Array.from({ length: 25 }, (_, i) => ({ date: isoDay(from + i * DAY), source: i < 10 ? "chirps" : "chirps_prelim", precipMm: 0 })),
    );
    const r = await call("GET", `/org/plots/${plotId}/water-balance`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
    expect(r.body.crop).toBe("soja");
    const b = r.body.balance;
    expect(b.days).toBe(25);
    expect(b.rainMm).toBe(0);
    expect(b.etcMm).toBeGreaterThan(50); // soja de 25 días: Kc 0.4 a 0.9, ET0 ~ 6 mm
    expect(b.balanceMm).toBeLessThan(0);
    expect(b.balance14Mm).toBeLessThan(0);
    expect(["medium", "high"]).toContain(b.risk);
    expect(b.series).toHaveLength(25);
  });

  it("dice qué falta: cultivo, referencia, siembra o datos", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const plotId = plotIds[0]!;
    const get = async () => (await call("GET", `/org/plots/${plotId}/water-balance`, { token: owner.token })).body;
    expect((await get()).status).toBe("no_sowing_date");
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { sowingDate: isoDay(Date.now() - 5 * DAY) } });
    expect(await get()).toMatchObject({ status: "no_data", balance: null });
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { crop: "chia" } });
    expect((await get()).status).toBe("no_reference");
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { crop: null } });
    expect((await get()).status).toBe("no_crop");
  });

  it("respeta la organización y los lotes asignados", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 2);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/plots/${plotIds[0]}/water-balance`, { token: other.token })).status).toBe(404);
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/plots/${plotIds[0]}/water-balance`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    expect((await call("GET", `/org/plots/${plotIds[0]}/water-balance`, { token: worker.token })).status).toBe(200);
    expect((await call("GET", `/org/plots/${plotIds[1]}/water-balance`, { token: worker.token })).status).toBe(404);
  });
});
