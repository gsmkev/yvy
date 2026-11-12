import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return { "x-yvy-timestamp": String(ts), "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`) };
};
const ingest = async (payload: unknown) => {
  const body = JSON.stringify(payload);
  return call<any>("POST", "/ingest/management-zones", { body, headers: await signed("POST", "/ingest/management-zones", body) });
};

const part = (x: number) => [[[x, -27.2], [x + 0.001, -27.2], [x + 0.001, -27.201], [x, -27.201], [x, -27.2]]];
const zone = (n: number, extra: Record<string, unknown> = {}) => ({
  zone: n,
  areaHa: 10 * n,
  pct: 33.3,
  meanNdvi: 0.4 + 0.15 * n,
  geometry: { type: "MultiPolygon", coordinates: [part(-55.9 + n * 0.002)] },
  ...extra,
});

describe("A-32 · zonas de manejo", () => {
  it("el job las sube firmadas, reemplaza las anteriores y la web las lee", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const r = await ingest({ plotId: plotIds[0], seasons: [2023, 2024, 2025], zones: [zone(1), zone(2), zone(3)] });
    expect(r.status).toBe(200);
    expect(r.body.written).toBe(3);
    let list = await call<any[]>("GET", `/org/farms/${farmId}/management-zones`, { token: owner.token });
    expect(list.body).toHaveLength(3);
    expect(list.body.map((z) => z.zone)).toEqual([1, 2, 3]);
    expect(JSON.parse(list.body[0].geometry).type).toBe("MultiPolygon");
    expect(JSON.parse(list.body[0].seasons)).toEqual([2023, 2024, 2025]);
    // un cálculo nuevo reemplaza al anterior
    await ingest({ plotId: plotIds[0], seasons: [2024, 2025], zones: [zone(1), zone(3)] });
    list = await call<any[]>("GET", `/org/farms/${farmId}/management-zones`, { token: owner.token });
    expect(list.body.map((z) => z.zone)).toEqual([1, 3]);
  });

  it("valida la forma: firma, zonas, geometría y lote existente", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    expect((await call("POST", "/ingest/management-zones", { body: JSON.stringify({}) })).status).toBe(401);
    const base = { plotId: plotIds[0], seasons: [2024, 2025] };
    expect((await ingest({ ...base, zones: [] })).status).toBe(400);
    expect((await ingest({ ...base, zones: [zone(4)] })).status).toBe(400);
    expect((await ingest({ ...base, zones: [zone(1), zone(1)] })).status).toBe(400);
    expect((await ingest({ ...base, zones: [zone(1, { geometry: { type: "Polygon", coordinates: part(-55.9) } })] })).status).toBe(400);
    expect((await ingest({ ...base, seasons: [2024], zones: [zone(1)] })).status).toBe(400);
    expect((await ingest({ ...base, plotId: "01a1cbc6-c1c7-7ad1-86f6-e16e35f262f7", zones: [zone(1)] })).status).toBe(404);
  });

  it("el empleado no las ve; otra organización tampoco", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    await ingest({ plotId: plotIds[0], seasons: [2024, 2025], zones: [zone(1), zone(2), zone(3)] });
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/farms/${farmId}/management-zones`, { token: worker.token })).status).toBe(403);
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing.");
    expect((await call<any[]>("GET", `/org/farms/${farmId}/management-zones`, { token: agro.token })).body).toHaveLength(3);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/management-zones`, { token: other.token })).status).toBe(404);
  });
});
