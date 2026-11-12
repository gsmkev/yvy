import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

const map = (over: Record<string, unknown> = {}) => ({
  fileName: "cosecha-lote1.zip",
  nPoints: 4200,
  nDropped: 35,
  meanTHa: 3.4,
  p10THa: 2.6,
  p90THa: 4.1,
  minTHa: 1.2,
  maxTHa: 5.3,
  cvPct: 18.2,
  cellM: 20,
  cells: [[-55.895, -27.205, 3.4, 12], [-55.894, -27.205, 3.9, 9]],
  ...over,
});

async function season(token: string) {
  return (await call<{ id: string }>("POST", "/org/seasons", { token, body: { name: "Zafra 2025/26" } })).body.id;
}

describe("A-21 · mapas de rendimiento", () => {
  it("guarda el resumen y la grilla, y el mapa nuevo reemplaza al anterior de la misma campaña", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const seasonId = await season(owner.token);
    const a = await call<{ id: string }>("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token, body: map({ seasonId }) });
    expect(a.status).toBe(201);
    await call("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token, body: map({ seasonId, meanTHa: 3.9 }) });
    const sinCampania = await call("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token, body: map() });
    expect(sinCampania.status).toBe(201);
    const list = await call<any[]>("GET", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token });
    expect(list.body).toHaveLength(2);
    const withSeason = list.body.find((m) => m.seasonId === seasonId);
    expect(withSeason).toMatchObject({ meanTHa: 3.9, seasonName: "Zafra 2025/26", nPoints: 4200 });
    expect(JSON.parse(withSeason.cells)).toHaveLength(2);
    expect((await call("DELETE", `/org/yield-maps/${withSeason.id}`, { token: owner.token })).status).toBe(200);
    expect((await call<any[]>("GET", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token })).body).toHaveLength(1);
  });

  it("valida la forma: celdas, rangos, tamaño y campaña existente", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const post = (body: unknown) => call("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token, body });
    expect((await post(map({ cells: [] }))).status).toBe(400);
    expect((await post(map({ cells: [[-55.9, -27.2, 3]] }))).status).toBe(400);
    expect((await post(map({ cells: Array.from({ length: 801 }, () => [-55.9, -27.2, 3, 1]) }))).status).toBe(400);
    expect((await post(map({ meanTHa: -1 }))).status).toBe(400);
    expect((await post(map({ nPoints: 1 }))).status).toBe(400);
    expect((await post(map({ seasonId: "01a1cbc6-c1c7-7ad1-86f6-e16e35f262f7" }))).status).toBe(404);
    expect((await post("no es json")).status).toBe(400);
    const big = map({ fileName: "x".repeat(150_000) });
    expect((await post(big)).status).toBe(413);
  });

  it("el empleado no lee ni escribe; otra organización no ve el lote", async () => {
    const owner = await createOrgWithOwner();
    const { plotIds } = await createFarmWithPlots(owner.token, 1);
    const made = await call<{ id: string }>("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: owner.token, body: map() });
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
    expect((await call("GET", `/org/plots/${plotIds[0]}/yield-maps`, { token: worker.token })).status).toBe(403);
    expect((await call("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: worker.token, body: map() })).status).toBe(403);
    expect((await call("DELETE", `/org/yield-maps/${made.body.id}`, { token: worker.token })).status).toBe(403);
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing.");
    expect((await call("GET", `/org/plots/${plotIds[0]}/yield-maps`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/plots/${plotIds[0]}/yield-maps`, { token: other.token })).status).toBe(404);
    expect((await call("POST", `/org/plots/${plotIds[0]}/yield-maps`, { token: other.token, body: map() })).status).toBe(404);
    expect((await call("DELETE", `/org/yield-maps/${made.body.id}`, { token: other.token })).status).toBe(404);
  });
});
