import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, square } from "./helpers";

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return {
    "x-yvy-timestamp": String(ts),
    "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
  };
};

const area = (lon: number, lat: number, ha = 1.2) => ({
  geometry: square(lon, lat, 0.001),
  areaHa: ha,
  lon: lon + 0.0005,
  lat: lat - 0.0005,
  meanNdvi: 0.41,
  plotMedianNdvi: 0.78,
});

const send = async (plotId: string, acquiredAt: number, areas: unknown[]) => {
  const body = JSON.stringify({ plotId, acquiredAt, areas });
  return call("POST", "/ingest/problem-areas", { body, headers: await signed("POST", "/ingest/problem-areas", body) });
};

describe("S-08 · áreas problema por lote", () => {
  it("ingest las guarda, reemplaza las viejas y no pisa una escena más nueva", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    expect((await send(plotIds[0]!, 1000, [area(-55.895, -27.205), area(-55.89, -27.21, 0.8)])).body).toEqual({ written: 2 });

    const list = async () =>
      (await call<any[]>("GET", `/org/farms/${farmId}/problem-areas`, { token: owner.token })).body;
    let rows = await list();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ plotId: plotIds[0], plotName: "Lote 1", areaHa: 1.2, meanNdvi: 0.41 });
    expect(JSON.parse(rows[0].geometry).type).toBe("Polygon");

    // escena nueva: reemplaza
    await send(plotIds[0]!, 2000, [area(-55.895, -27.205, 3)]);
    rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0].acquiredAt).toBe(2000);

    // una escena más vieja llega tarde: no pisa
    expect((await send(plotIds[0]!, 1500, [])).body).toEqual({ written: 0 });
    expect(await list()).toHaveLength(1);

    // sin áreas en la escena siguiente: se limpian
    await send(plotIds[0]!, 3000, []);
    expect(await list()).toHaveLength(0);
  });

  it("ingest exige firma, forma válida y lote existente", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const body = JSON.stringify({ plotId: plotIds[0], acquiredAt: 1, areas: [] });
    expect((await call("POST", "/ingest/problem-areas", { body })).status).toBe(401);
    expect((await send(plotIds[0]!, 1, [{ geometry: { type: "Point", coordinates: [0, 0] } }])).status).toBe(400);
    expect((await send("0190f0e0-0000-7000-8000-000000000000", 1, [])).status).toBe(404);
  });

  it("permisos: el agrónomo ve las áreas; el empleado y otra organización no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    await send(plotIds[0]!, 1000, [area(-55.895, -27.205)]);
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/problem-areas`, { token: agro.token })).status).toBe(200);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/problem-areas`, { token: worker.token })).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/problem-areas`, { token: other.token })).status).toBe(404);
  });
});
