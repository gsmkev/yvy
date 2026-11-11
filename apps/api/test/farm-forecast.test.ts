import { describe, expect, it } from "vitest";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

describe("C-02 · pronóstico liviano para la app", () => {
  it("devuelve la última corrida y respeta la organización y los lotes asignados", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const day = (n: number) => `2026-11-${String(10 + n).padStart(2, "0")}`;
    const rows = (runAt: number, tmin: number) =>
      Array.from({ length: 10 }, (_, i) => ({
        farmId,
        runAt,
        source: "met_norway",
        validDate: day(i),
        tminC: tmin + i,
        tmaxC: 30,
        precipMm: i,
        windKmh: 5,
        windDirDeg: 90,
      }));
    await db().insert(s.forecasts).values(rows(1000, 1));
    await db().insert(s.forecasts).values(rows(2000, 5));

    const res = await call("GET", `/org/farms/${farmId}/forecast`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body.runAt).toBe(2000);
    expect(res.body.source).toBe("met_norway");
    expect(res.body.days).toHaveLength(10);
    expect(res.body.days[0]).toEqual({ date: day(0), tminC: 5, tmaxC: 30, precipMm: 0 });

    // empleado sin lotes asignados: no ve la estancia; con un lote asignado, sí
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/forecast`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    expect((await call("GET", `/org/farms/${farmId}/forecast`, { token: worker.token })).status).toBe(200);

    // otra organización: 404
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/forecast`, { token: other.token })).status).toBe(404);
  });

  it("sin corridas devuelve días vacíos", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const res = await call("GET", `/org/farms/${farmId}/forecast`, { token: owner.token });
    expect(res.body).toEqual({ runAt: null, source: null, days: [] });
  });
});
