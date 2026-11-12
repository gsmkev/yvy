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

  it("A-43: suma el riego registrado en el lote y avisa si falta la temperatura", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const plotId = plotIds[0]!;
    const from = Date.now() - 20 * DAY;
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { sowingDate: isoDay(from) } });
    await seedClimate(
      farmId,
      Array.from({ length: 15 }, (_, i) => ({ date: isoDay(from + i * DAY), source: "chirps", precipMm: 0 })),
    );
    const base = (await call("GET", `/org/plots/${plotId}/water-balance`, { token: owner.token })).body.balance;
    // sin temperatura: solo lluvia, y lo dice
    expect(base.etMissingDays).toBe(15);
    expect(base.balanceMm).toBe(0);
    expect(base.risk).toBeNull();
    const push = await call("POST", "/sync/push", {
      token: owner.token,
      body: {
        deviceId: "t",
        mutations: [
          {
            mutationId: "11111111-1111-4111-8111-111111111111",
            kind: "records.upsert",
            row: {
              id: "22222222-2222-4222-8222-222222222222",
              farmId,
              plotId,
              poiId: null,
              kind: "irrigation",
              data: { mm: 25, method: "pivot", appliedAt: from + 3 * DAY },
              schemaVersion: 1,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: from + 3 * DAY,
            },
          },
        ],
      },
    });
    expect(push.body.results[0].status).toBe("applied");
    const b = (await call("GET", `/org/plots/${plotId}/water-balance`, { token: owner.token })).body.balance;
    expect(b.irrigationMm).toBe(25);
    expect(b.balanceMm).toBe(25);
    // con temperaturas el consumo se descuenta
    await seedClimate(
      farmId,
      Array.from({ length: 15 }, (_, i) => ({ date: isoDay(from + i * DAY), source: "nasa_power", tminC: 24, tmaxC: 38 })),
    );
    const c = (await call("GET", `/org/plots/${plotId}/water-balance`, { token: owner.token })).body.balance;
    expect(c.etMissingDays).toBe(0);
    expect(c.irrigationMm).toBe(25);
    expect(c.balanceMm).toBeLessThan(25);
  });
});
