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

const result = (plotId: string, over: Record<string, unknown> = {}) => ({
  plotId,
  status: "possible_loss",
  plotAreaHa: 100,
  forestRefHa: 40,
  lossHa: 3.2,
  validPct: 98.5,
  refYear: 2020,
  curYear: 2026,
  refFromAt: 1_591_000_000_000,
  refToAt: 1_601_000_000_000,
  curFromAt: 1_780_000_000_000,
  curToAt: 1_790_000_000_000,
  refScenes: 12,
  curScenes: 14,
  changes: [{ geometry: square(-55.895, -27.205, 0.001), areaHa: 3.2 }],
  ...over,
});

const send = async (body: unknown) => {
  const raw = JSON.stringify(body);
  return call("POST", "/ingest/eudr", { body: raw, headers: await signed("POST", "/ingest/eudr", raw) });
};

describe("S-30 · indicador EUDR por lote", () => {
  it("ingest guarda el resultado, lo reemplaza y la estancia lo muestra con el nombre del lote", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const url = `/org/farms/${farmId}/eudr`;
    expect((await call<any>("GET", url, { token: owner.token })).body).toEqual({ computedAt: null, plots: [] });

    expect((await send(result(plotIds[0]!))).status).toBe(200);
    expect((await send(result(plotIds[1]!, { status: "no_change", lossHa: 0, changes: [] }))).status).toBe(200);
    let { body } = await call<any>("GET", url, { token: owner.token });
    expect(body.plots).toHaveLength(2);
    expect(body.plots[0]).toMatchObject({ plotId: plotIds[0], plotName: "Lote 1", status: "possible_loss", lossHa: 3.2, refYear: 2020 });
    const fc = JSON.parse(body.plots[0].changes);
    expect(fc.features[0]).toMatchObject({ type: "Feature", properties: { areaHa: 3.2 }, geometry: { type: "Polygon" } });
    expect(body.plots[1].status).toBe("no_change");

    // un cálculo nuevo reemplaza al anterior (una fila por lote)
    await send(result(plotIds[0]!, { status: "no_change", lossHa: 0, changes: [], curYear: 2027 }));
    body = (await call<any>("GET", url, { token: owner.token })).body;
    expect(body.plots).toHaveLength(2);
    expect(body.plots.find((p: any) => p.plotId === plotIds[0])).toMatchObject({ status: "no_change", lossHa: 0, curYear: 2027 });
  });

  it("ingest exige firma, forma válida y lote existente", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    expect((await call("POST", "/ingest/eudr", { body: JSON.stringify(result(plotIds[0]!)) })).status).toBe(401);
    expect((await send(result(plotIds[0]!, { status: "certificado" }))).status).toBe(400);
    expect((await send(result(plotIds[0]!, { lossHa: -1 }))).status).toBe(400);
    expect((await send(result(plotIds[0]!, { changes: [{ geometry: { type: "Point", coordinates: [0, 0] }, areaHa: 1 }] }))).status).toBe(400);
    expect((await send(result("0190f0e0-0000-7000-8000-000000000000"))).status).toBe(404);
  });

  it("permisos: dueño y agrónomo lo ven; el empleado y otra organización no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    await send(result(plotIds[0]!));
    const url = `/org/farms/${farmId}/eudr`;
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", url, { token: agro.token })).status).toBe(200);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", url, { token: worker.token })).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", url, { token: other.token })).status).toBe(404);
    expect((await call("GET", url)).status).toBe(401);
  });
});
