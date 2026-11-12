import { describe, expect, it } from "vitest";
import * as s from "@yvy/shared/schema";
import { DAY, isoDay, seedPower } from "./agri2-helpers";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

async function seedForecast(farmId: string, rows: { tminC: number; precipMm: number }[], runAt = Date.now()) {
  await db()
    .insert(s.forecasts)
    .values(
      rows.map((r, i) => ({
        farmId,
        runAt,
        source: "met_norway",
        // desde hoy (UTC) en adelante: la zona de Asunción es UTC-3/-4, así que la fecha local de hoy es hoy o ayer
        validDate: isoDay(Date.now() + (i + 1) * DAY),
        tminC: r.tminC,
        tmaxC: 30,
        precipMm: r.precipMm,
        windKmh: 5,
        windDirDeg: 90,
      })),
    );
}

describe("A-05 · ventana de siembra", () => {
  it("combina humedad del suelo y pronóstico día por día", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await seedPower(farmId, Date.now() - 3 * DAY, 3, 20, 30, 0.6);
    await seedForecast(farmId, [
      { tminC: 18, precipMm: 25 }, // lluvia fuerte
      { tminC: 6, precipMm: 0 }, // frío
      { tminC: 18, precipMm: 0 }, // apto
      { tminC: 18, precipMm: 1 }, // apto
    ]);
    const r = await call("GET", `/org/farms/${farmId}/sowing-window?crop=soja`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.soil).toBe(0.6);
    expect(r.body.days.map((d: any) => d.reasons)).toEqual([["rain_day"], ["cold"], [], []]);
    expect(r.body.best).toEqual({ from: r.body.days[2].date, to: r.body.days[3].date });
    // el trigo aguanta el frío de la segunda noche
    const wheat = await call("GET", `/org/farms/${farmId}/sowing-window?crop=trigo`, { token: owner.token });
    expect(wheat.body.days[1].reasons).toEqual([]);
  });

  it("sin datos devuelve días vacíos; cultivo inválido es 400", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const r = await call("GET", `/org/farms/${farmId}/sowing-window`, { token: owner.token });
    expect(r.body).toMatchObject({ crop: "soja", soil: null, days: [], best: null, forecastRunAt: null });
    expect((await call("GET", `/org/farms/${farmId}/sowing-window?crop=papa`, { token: owner.token })).status).toBe(400);
  });

  it("respeta la organización y los lotes asignados", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/sowing-window`, { token: other.token })).status).toBe(404);
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/sowing-window`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    expect((await call("GET", `/org/farms/${farmId}/sowing-window`, { token: worker.token })).status).toBe(200);
  });
});
