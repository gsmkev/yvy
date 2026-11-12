import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { DAY, isoDay, seedPower } from "./agri2-helpers";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";
import { push, rec } from "./records-helpers";

describe("A-04 · fenología por grados-día", () => {
  it("acumula desde el registro de siembra y compara con el estado observado", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const plotId = plotIds[0]!;
    const sownAt = Date.now() - 60 * DAY;
    // siembra de soja hace 60 días y 60 días de 15 GDD (20/30 con base 10) = 900 GDD: floración
    await seedPower(farmId, sownAt, 60);
    expect(
      (await push(owner.token, [rec(farmId, plotId, "sowing", { crop: "soja" }, sownAt), rec(farmId, plotId, "crop_status", { stage: "floracion", condition: "good" }, Date.now() - DAY)])).status,
    ).toBe(200);

    const r = await call("GET", `/org/plots/${plotId}/phenology`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: "ok",
      crop: "soja",
      sowingSource: "record",
      baseC: 10,
      gdd: 900,
      estimatedStage: "floracion",
      next: { stage: "llenado", gddLeft: 150 },
      observed: { stage: "floracion", condition: "good" },
      comparison: "on_track",
    });
    expect(r.body.coverage.days).toBe(60);
  });

  it("sin fecha de siembra, sin cultivo o sin datos de temperatura lo dice", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const plotId = plotIds[0]!;
    expect((await call("GET", `/org/plots/${plotId}/phenology`, { token: owner.token })).body.status).toBe("no_sowing_date");
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { sowingDate: isoDay(Date.now() - 10 * DAY) } });
    expect((await call("GET", `/org/plots/${plotId}/phenology`, { token: owner.token })).body).toMatchObject({ status: "no_data", sowingSource: "plot", gdd: null });
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { crop: "chia" } });
    expect((await call("GET", `/org/plots/${plotId}/phenology`, { token: owner.token })).body.status).toBe("no_reference");
    await call("PATCH", `/org/plots/${plotId}`, { token: owner.token, body: { crop: null } });
    expect((await call("GET", `/org/plots/${plotId}/phenology`, { token: owner.token })).body.status).toBe("no_crop");
    void farmId;
  });

  it("respeta la organización y los lotes asignados", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 2);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/plots/${plotIds[0]}/phenology`, { token: other.token })).status).toBe(404);
    expect((await call("GET", `/org/plots/${newId()}/phenology`, { token: owner.token })).status).toBe(404);
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/plots/${plotIds[0]}/phenology`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    expect((await call("GET", `/org/plots/${plotIds[0]}/phenology`, { token: worker.token })).status).toBe(200);
    expect((await call("GET", `/org/plots/${plotIds[1]}/phenology`, { token: worker.token })).status).toBe(404);
  });
});
