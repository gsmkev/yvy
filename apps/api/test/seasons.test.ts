/** Campañas, plan por lote e historial de rotación (ADR 0004, A-01 y A-02). */
import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  const worker = await addMemberAndLogin(owner.token, "worker");
  const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Agrónoma");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]!] } });
  return { owner, worker, agro, farmId, plotIds };
}

const newSeason = (token: string, body: Record<string, unknown> = {}) =>
  call<{ id: string }>("POST", "/org/seasons", {
    token,
    body: { name: "Zafra 2026/27", startDate: "2026-09-01", endDate: "2027-04-30", ...body },
  });

describe("campañas", () => {
  it("el agrónomo crea y edita; el empleado solo ve", async () => {
    const { owner, worker, agro } = await setup();
    const created = await newSeason(agro.token);
    expect(created.status).toBe(201);
    expect((await newSeason(worker.token)).status).toBe(403);
    expect(
      (await call("PATCH", `/org/seasons/${created.body.id}`, { token: worker.token, body: { active: false } })).status,
    ).toBe(403);
    expect((await call("DELETE", `/org/seasons/${created.body.id}`, { token: worker.token })).status).toBe(403);
    const list = await call<{ seasons: { id: string; active: boolean }[] }>("GET", "/org/seasons", {
      token: worker.token,
    });
    expect(list.status).toBe(200);
    expect(list.body.seasons.map((x) => x.id)).toEqual([created.body.id]);
    const patch = await call("PATCH", `/org/seasons/${created.body.id}`, { token: owner.token, body: { active: false } });
    expect(patch.status).toBe(200);
  });

  it("valida nombre y fechas", async () => {
    const { owner } = await setup();
    expect((await newSeason(owner.token, { name: "  " })).status).toBe(400);
    expect((await newSeason(owner.token, { startDate: "2027-05-01", endDate: "2027-04-01" })).status).toBe(400);
  });

  it("no se ven ni se tocan campañas de otra organización", async () => {
    const { owner } = await setup();
    const other = await createOrgWithOwner("Otra");
    const s1 = await newSeason(owner.token);
    expect((await call("GET", "/org/seasons", { token: other.token })).body.seasons).toEqual([]);
    expect((await call("PATCH", `/org/seasons/${s1.body.id}`, { token: other.token, body: { name: "x" } })).status).toBe(
      404,
    );
    expect(await pullAll(other.token, "seasons")).toEqual([]);
  });

  it("baja al celular: seasons para todos, plot_seasons solo de los lotes asignados", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const season = await newSeason(owner.token);
    for (const plotId of plotIds)
      await call("PUT", `/org/seasons/${season.body.id}/plots/${plotId}`, { token: owner.token, body: { crop: "soja" } });
    expect((await pullAll(worker.token, "seasons")).map((x) => x.id)).toEqual([season.body.id]);
    expect((await pullAll(worker.token, "plot_seasons")).map((x) => x.plotId)).toEqual([plotIds[0]]);
    expect(await pullAll(owner.token, "plot_seasons")).toHaveLength(3);
    const farmList = await call<{ plotSeasons: unknown[] }>("GET", `/org/seasons?farmId=${farmId}`, { token: owner.token });
    expect(farmList.body.plotSeasons).toHaveLength(3);
  });

  it("borrar la campaña borra su plan por lote", async () => {
    const { owner, plotIds } = await setup();
    const season = await newSeason(owner.token);
    await call("PUT", `/org/seasons/${season.body.id}/plots/${plotIds[0]}`, { token: owner.token, body: { crop: "maiz" } });
    expect((await call("DELETE", `/org/seasons/${season.body.id}`, { token: owner.token })).status).toBe(200);
    const rows = await pullAll(owner.token, "plot_seasons");
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).not.toBeNull();
    expect((await call("GET", "/org/seasons", { token: owner.token })).body.seasons).toEqual([]);
  });
});

describe("plan por lote", () => {
  it("una fila por lote y campaña: el segundo PUT la actualiza", async () => {
    const { owner, agro, plotIds } = await setup();
    const season = await newSeason(owner.token);
    const url = `/org/seasons/${season.body.id}/plots/${plotIds[0]}`;
    expect(
      (
        await call("PUT", url, {
          token: agro.token,
          body: { crop: "soja", variety: "DM 6563", plannedSowingDate: "2026-10-20", targetYieldTHa: 3.5 },
        })
      ).status,
    ).toBe(200);
    await call("PUT", url, { token: agro.token, body: { crop: "maiz", targetYieldTHa: 9 } });
    const rows = await pullAll(owner.token, "plot_seasons");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ crop: "maiz", variety: null, targetYieldTHa: 9 });
  });

  it("el empleado no puede cargar el plan; lote o campaña inexistentes dan 404", async () => {
    const { owner, worker, plotIds } = await setup();
    const season = await newSeason(owner.token);
    expect(
      (await call("PUT", `/org/seasons/${season.body.id}/plots/${plotIds[0]}`, { token: worker.token, body: { crop: "soja" } }))
        .status,
    ).toBe(403);
    expect(
      (await call("PUT", `/org/seasons/${season.body.id}/plots/${newId()}`, { token: owner.token, body: { crop: "soja" } }))
        .status,
    ).toBe(404);
    expect(
      (await call("PUT", `/org/seasons/${newId()}/plots/${plotIds[0]}`, { token: owner.token, body: { crop: "soja" } }))
        .status,
    ).toBe(404);
  });

  it("valida cultivo y rinde objetivo", async () => {
    const { owner, plotIds } = await setup();
    const season = await newSeason(owner.token);
    const url = `/org/seasons/${season.body.id}/plots/${plotIds[0]}`;
    expect((await call("PUT", url, { token: owner.token, body: { crop: "papa" } })).status).toBe(400);
    expect((await call("PUT", url, { token: owner.token, body: { crop: "soja", targetYieldTHa: -1 } })).status).toBe(400);
  });

  it("quitar el plan lo borra y se puede volver a cargar", async () => {
    const { owner, plotIds } = await setup();
    const season = await newSeason(owner.token);
    const url = `/org/seasons/${season.body.id}/plots/${plotIds[0]}`;
    await call("PUT", url, { token: owner.token, body: { crop: "soja" } });
    expect((await call("DELETE", url, { token: owner.token })).status).toBe(200);
    expect((await call("DELETE", url, { token: owner.token })).status).toBe(404);
    await call("PUT", url, { token: owner.token, body: { crop: "trigo" } });
    const rows = await pullAll(owner.token, "plot_seasons");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ crop: "trigo", deletedAt: null });
  });
});

describe("historial de rotación del lote (A-02)", () => {
  it("junta plan y siembras reales por campaña, la más reciente primero", async () => {
    const { owner, worker, plotIds, farmId } = await setup();
    const old = await newSeason(owner.token, { name: "Zafra 2025/26", startDate: "2025-09-01", endDate: "2026-04-30" });
    const cur = await newSeason(owner.token);
    await call("PUT", `/org/seasons/${old.body.id}/plots/${plotIds[0]}`, { token: owner.token, body: { crop: "maiz" } });
    await call("PUT", `/org/seasons/${cur.body.id}/plots/${plotIds[0]}`, {
      token: owner.token,
      body: { crop: "soja", plannedSowingDate: "2026-10-20" },
    });
    // la siembra real manda sobre el plan
    const push = await call("POST", "/sync/push", {
      token: worker.token,
      body: {
        deviceId: "d",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId,
              plotId: plotIds[0],
              poiId: null,
              kind: "sowing",
              data: { seasonId: cur.body.id, crop: "girasol", variety: "Paraíso" },
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: Date.now(),
            },
          },
        ],
      },
    });
    expect(push.body.results[0].status).toBe("applied");
    const h = await call<{ seasonName: string; crop: string; variety: string | null; sownOn: number | null }[]>(
      "GET",
      `/org/plots/${plotIds[0]}/seasons`,
      { token: owner.token },
    );
    expect(h.status).toBe(200);
    expect(h.body.map((r) => [r.seasonName, r.crop])).toEqual([
      ["Zafra 2026/27", "girasol"],
      ["Zafra 2025/26", "maiz"],
    ]);
    expect(h.body[0]!.variety).toBe("Paraíso");
    expect(h.body[0]!.sownOn).not.toBeNull();
  });

  it("el empleado solo ve el historial de sus lotes", async () => {
    const { worker, plotIds } = await setup();
    expect((await call("GET", `/org/plots/${plotIds[0]}/seasons`, { token: worker.token })).status).toBe(200);
    expect((await call("GET", `/org/plots/${plotIds[1]}/seasons`, { token: worker.token })).status).toBe(404);
  });
});

describe("registro de siembra", () => {
  it("valida los datos de sowing", async () => {
    const { owner, farmId } = await setup();
    const send = (data: unknown) =>
      call("POST", "/sync/push", {
        token: owner.token,
        body: {
          deviceId: "d",
          mutations: [
            {
              mutationId: newId(),
              kind: "records.upsert",
              row: {
                id: newId(),
                farmId,
                plotId: null,
                poiId: null,
                kind: "sowing",
                data,
                schemaVersion: RECORD_SCHEMA_VERSION,
                lon: null,
                lat: null,
                gpsAccuracyM: null,
                capturedAt: Date.now(),
              },
            },
          ],
        },
      });
    expect((await send({ crop: "soja", density: 14, densityUnit: "seeds_m", areaHa: 20 })).body.results[0].status).toBe(
      "applied",
    );
    expect((await send({ crop: "papa" })).body.results[0].status).toBe("rejected");
    expect((await send({ crop: "soja", density: 14 })).body.results[0].status).toBe("rejected");
    expect((await send({ crop: "soja", areaHa: -3 })).body.results[0].status).toBe("rejected");
  });
});

describe("cosecha y rinde por lote (A-20)", () => {
  const harvest = (token: string, farmId: string, plotId: string, data: unknown) =>
    call("POST", "/sync/push", {
      token,
      body: {
        deviceId: "d",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId,
              plotId,
              poiId: null,
              kind: "harvest",
              data,
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: Date.now(),
            },
          },
        ],
      },
    });

  it("el historial del lote trae toneladas y rinde t/ha por campaña", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const season = await newSeason(owner.token);
    await call("PUT", `/org/seasons/${season.body.id}/plots/${plotIds[0]}`, {
      token: owner.token,
      body: { crop: "soja", targetYieldTHa: 3.5 },
    });
    // el lote del helper mide ~ 1,5 km por lado: rinde con superficie explícita para no depender de eso
    expect((await harvest(worker.token, farmId, plotIds[0]!, { seasonId: season.body.id, tons: 60, areaHa: 20 })).body.results[0].status).toBe("applied");
    expect((await harvest(worker.token, farmId, plotIds[0]!, { seasonId: season.body.id, tons: 30, areaHa: 10, moisturePct: 13.5, destination: "silo" })).body.results[0].status).toBe("applied");
    const h = await call<{ harvestTons: number; yieldTHa: number; targetYieldTHa: number }[]>("GET", `/org/plots/${plotIds[0]}/seasons`, { token: owner.token });
    expect(h.body[0]).toMatchObject({ harvestTons: 90, yieldTHa: 3, targetYieldTHa: 3.5 });
  });

  it("valida toneladas, humedad y destino", async () => {
    const { owner, farmId, plotIds } = await setup();
    const bad = async (data: unknown) =>
      expect((await harvest(owner.token, farmId, plotIds[0]!, data)).body.results[0].status).toBe("rejected");
    await bad({});
    await bad({ tons: 0 });
    await bad({ tons: 5, moisturePct: 120 });
    await bad({ tons: 5, destination: "puerto" });
  });
});

describe("densidad de siembra y plan vigente (A-01)", () => {
  const put = (token: string, seasonId: string, plotId: string, body: Record<string, unknown>) =>
    call("PUT", `/org/seasons/${seasonId}/plots/${plotId}`, { token, body });

  it("guarda la densidad planificada con su unidad, la baja al celular y la muestra en el historial", async () => {
    const { owner, plotIds } = await setup();
    const season = await newSeason(owner.token);
    const ok = await put(owner.token, season.body.id, plotIds[0]!, { crop: "soja", sowingDensity: 60, densityUnit: "kg_ha" });
    expect(ok.status).toBe(200);
    expect((await pullAll(owner.token, "plot_seasons"))[0]).toMatchObject({ sowingDensity: 60, densityUnit: "kg_ha" });
    const h = await call<{ sowingDensity: number | null; densityUnit: string | null }[]>("GET", `/org/plots/${plotIds[0]}/seasons`, { token: owner.token });
    expect(h.body[0]).toMatchObject({ sowingDensity: 60, densityUnit: "kg_ha" });
  });

  it("pide la unidad con la densidad y borra ambas si se quita la densidad", async () => {
    const { owner, plotIds } = await setup();
    const season = await newSeason(owner.token);
    expect((await put(owner.token, season.body.id, plotIds[0]!, { crop: "soja", sowingDensity: 60 })).status).toBe(400);
    expect((await put(owner.token, season.body.id, plotIds[0]!, { sowingDensity: 0, densityUnit: "kg_ha" })).status).toBe(400);
    await put(owner.token, season.body.id, plotIds[0]!, { crop: "soja", sowingDensity: 14, densityUnit: "seeds_m" });
    await put(owner.token, season.body.id, plotIds[0]!, { crop: "soja", densityUnit: "kg_ha" });
    expect((await pullAll(owner.token, "plot_seasons"))[0]).toMatchObject({ sowingDensity: null, densityUnit: null });
  });

  it("el cultivo y la fecha del plan de la campaña activa mandan sobre el texto libre del lote", async () => {
    const { owner, plotIds } = await setup();
    // Los lotes de prueba nacen con crop soja; el plan dice maíz.
    const season = await newSeason(owner.token);
    await put(owner.token, season.body.id, plotIds[0]!, { crop: "maiz", plannedSowingDate: "2026-09-20" });
    const r = await call("GET", `/org/plots/${plotIds[0]}/phenology`, { token: owner.token });
    expect(r.body).toMatchObject({ crop: "maiz", sowingDate: "2026-09-20", sowingSource: "plan" });
    // Con la campaña cerrada vuelve al texto libre del lote.
    await call("PATCH", `/org/seasons/${season.body.id}`, { token: owner.token, body: { active: false } });
    expect((await call("GET", `/org/plots/${plotIds[0]}/phenology`, { token: owner.token })).body.crop).toBe("soja");
  });
});
