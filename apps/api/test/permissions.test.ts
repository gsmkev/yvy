/** Matriz de permisos (PRD §9) y criterio de aceptación de la Fase 1. */
import { describe, expect, it } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, pullAll, square } from "./helpers";

const rain = (farmId: string, plotId: string | null) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId,
    poiId: null,
    kind: "rain",
    data: { mm: 25, readAt: Date.now() },
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: null,
    lat: null,
    gpsAccuracyM: null,
    capturedAt: Date.now(),
  },
});

describe("Fase 1 · aceptación", () => {
  it("estancia con 20 lotes, empleado con 3: no puede leer los otros 17", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 20);
    const worker = await addMemberAndLogin(owner.token, "worker");
    const mine = plotIds.slice(0, 3);
    expect(
      (await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: mine } }))
        .status,
    ).toBe(200);

    expect((await pullAll(owner.token, "plots")).length).toBe(20);
    const seen = await pullAll(worker.token, "plots");
    expect(seen.map((p) => p.id).sort()).toEqual([...mine].sort());
    expect((await pullAll(worker.token, "farms")).map((f) => f.id)).toEqual([farmId]);
    expect(await pullAll(worker.token, "plot_index_stats")).toEqual([]);

    // registros del dueño en un lote ajeno no le llegan al empleado
    await call("POST", "/sync/push", {
      token: owner.token,
      body: { deviceId: "web", mutations: [rain(farmId, plotIds[10]!), rain(farmId, mine[0]!)] },
    });
    const recs = await pullAll(worker.token, "records");
    expect(recs.map((r) => r.plotId)).toEqual([mine[0]]);
  });

  it("superficie en ha cerca del valor geodésico", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const [plot] = await pullAll(owner.token, "plots");
    expect(plot.id).toBe(plotIds[0]);
    // 0,01° × 0,01° a 27° S ≈ 1.113 m × 991 m ≈ 110 ha
    expect(plot.areaHa).toBeGreaterThan(105);
    expect(plot.areaHa).toBeLessThan(115);
  });

  it("organizaciones aisladas", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const { farmId, plotIds } = await createFarmWithPlots(a.token, 2);
    expect(await pullAll(b.token, "plots")).toEqual([]);
    // B no puede crear lotes ni registros en la estancia de A
    expect(
      (
        await call("POST", `/org/farms/${farmId}/plots`, {
          token: b.token,
          body: {
            plots: [
              {
                name: "x",
                kind: "crop",
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                      [0, 0],
                    ],
                  ],
                },
              },
            ],
          },
        })
      ).status,
    ).toBe(404);
    const push = await call("POST", "/sync/push", {
      token: b.token,
      body: { deviceId: "d", mutations: [rain(farmId, plotIds[0]!)] },
    });
    expect(push.body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden" });
  });

  it("roles: empleado no gestiona; admin crea empleados pero no admins; agrónomo edita campo", async () => {
    const owner = await createOrgWithOwner();
    const worker = await addMemberAndLogin(owner.token, "worker");
    const admin = await addMemberAndLogin(owner.token, "admin", "Admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Agro");

    expect(
      (
        await call("POST", "/org/farms", {
          token: worker.token,
          body: {
            name: "x",
            geometry: square(-55, -27, 0.05),
          },
        })
      ).status,
    ).toBe(403);
    expect((await call("GET", "/org/members", { token: worker.token })).status).toBe(403);
    expect(
      (await call("POST", "/org/members", { token: admin.token, body: { fullName: "Peón", role: "worker" } })).status,
    ).toBe(201);
    expect(
      (
        await call("POST", "/org/members", {
          token: admin.token,
          body: { fullName: "Otro", role: "admin", email: "o@x.py" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("POST", "/org/farms", {
          token: agro.token,
          body: {
            name: "Agro",
            geometry: square(-55, -27, 0.05),
          },
        })
      ).status,
    ).toBe(201);
  });

  it("geometría inválida → 400", async () => {
    const owner = await createOrgWithOwner();
    const r = await call("POST", "/org/farms", {
      token: owner.token,
      body: {
        name: "x",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          ],
        },
      },
    });
    expect(r.status).toBe(400);
  });
});

describe("puntos de interés desde el celular (PRD §9 y §11)", () => {
  const poi = (farmId: string, over: Record<string, unknown> = {}) => ({
    mutationId: newId(),
    kind: "pois.upsert",
    row: { id: newId(), farmId, kind: "rain_gauge", name: "Pluviómetro de la casa", lon: -55.89, lat: -27.21, ...over },
  });
  const push = (token: string, mutations: unknown[]) =>
    call("POST", "/sync/push", { token, body: { deviceId: "dev", mutations } });

  it("dueño, administrador y agrónomo crean y editan; el empleado no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });

    for (const who of [owner, admin, agro]) {
      const m = poi(farmId);
      const r = await push(who.token, [m]);
      expect(r.body.results[0].status).toBe("applied");
      // Editar: mismo id, otro nombre
      const edit = { ...m, mutationId: newId(), row: { ...m.row, name: "Pluviómetro nuevo", kind: "water" } };
      expect((await push(who.token, [edit])).body.results[0].status).toBe("applied");
    }
    const denied = await push(worker.token, [poi(farmId)]);
    expect(denied.body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden" });

    const pois = await pullAll(owner.token, "points_of_interest");
    expect(pois).toHaveLength(3);
    expect(pois.every((p) => p.name === "Pluviómetro nuevo" && p.kind === "water")).toBe(true);
    // Lo del empleado rechazado no quedó guardado
    expect((await pullAll(worker.token, "points_of_interest")).length).toBe(3);
  });

  it("idempotente, valida estancia y forma, y un registro puede apuntar al punto nuevo en el mismo push", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const other = await createOrgWithOwner("Otra");
    const otherFarm = await createFarmWithPlots(other.token, 1);

    const m = poi(farmId);
    expect((await push(owner.token, [m])).body.results[0].status).toBe("applied");
    expect((await push(owner.token, [m])).body.results[0].status).toBe("duplicate");
    expect((await pullAll(owner.token, "points_of_interest")).filter((p) => p.id === m.row.id)).toHaveLength(1);

    // Estancia de otra organización
    expect((await push(owner.token, [poi(otherFarm.farmId)])).body.results[0]).toMatchObject({ status: "rejected", reason: "forbidden" });
    // Un id de otra organización no se pisa
    const theirs = poi(otherFarm.farmId);
    await push(other.token, [theirs]);
    const steal = { mutationId: newId(), kind: "pois.upsert", row: { ...theirs.row, farmId, name: "robado" } };
    expect((await push(owner.token, [steal])).body.results[0]).toMatchObject({ status: "rejected", reason: "not_found" });
    expect((await pullAll(other.token, "points_of_interest")).find((p) => p.id === theirs.row.id).name).toBe("Pluviómetro de la casa");
    // Nombre vacío: el protocolo lo rechaza
    expect((await push(owner.token, [poi(farmId, { name: "  " })])).status).toBe(400);

    // Registro en el punto recién creado, en el mismo push
    const p2 = poi(farmId, { name: "Aguada norte", kind: "water" });
    const rec = {
      mutationId: newId(),
      kind: "records.upsert",
      row: {
        id: newId(),
        farmId,
        plotId: null,
        poiId: p2.row.id,
        kind: "rain",
        data: { mm: 10, readAt: Date.now() },
        schemaVersion: RECORD_SCHEMA_VERSION,
        lon: null,
        lat: null,
        gpsAccuracyM: null,
        capturedAt: Date.now(),
      },
    };
    const r = await push(owner.token, [p2, rec]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied"]);
  });
});
