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
