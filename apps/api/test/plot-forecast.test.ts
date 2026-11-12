import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runJob } from "../src/jobs";
import { plotsNeedingForecast } from "../src/jobs/plot-forecast";
import met from "./fixtures/met-complete.json";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, square } from "./helpers";

function fakeMet() {
  const urls: string[] = [];
  const agents: string[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    agents.push((init?.headers as Record<string, string>)["User-Agent"] ?? "");
    return Response.json(met);
  }) as typeof fetch;
  return { fetchFn, urls, agents };
}

describe("C-03 · pronóstico por lote en estancias grandes", () => {
  it("solo las estancias de más de 2.000 ha reciben pronóstico por lote", async () => {
    const owner = await createOrgWithOwner();
    const big = await createFarmWithPlots(owner.token, 2); // 0,2° ≈ 49.000 ha
    const small = await call<{ id: string }>("POST", "/org/farms", { token: owner.token, body: { name: "Chica", geometry: square(-55.5, -27.2, 0.01) } });
    await call("POST", `/org/farms/${small.body.id}/plots`, { token: owner.token, body: { plots: [{ name: "A", kind: "crop", geometry: square(-55.499, -27.201, 0.005) }] } });
    const need = await plotsNeedingForecast(db());
    expect(need.filter((n) => n.farmId === big.farmId).map((n) => n.plotId).sort()).toEqual([...big.plotIds].sort());
    expect(need.some((n) => n.farmId === small.body.id)).toBe(false);
  });

  it("pide a MET Norway con User-Agent y 4 decimales, guarda los días y respeta la caché de 3 h", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const f = fakeMet();
    const t0 = Date.now();
    await runJob({ type: "plot_forecast", farmId, plotId: plotIds[0]! }, env, { fetch: f.fetchFn, now: () => t0 });
    expect(f.urls).toHaveLength(1);
    expect(f.urls[0]).toMatch(/lat=-?\d+\.\d{1,4}&lon=-?\d+\.\d{1,4}$/);
    expect(f.agents[0]).toBe("Yvy/1.0 koeti.com.py");
    // 2 horas después: caché, no vuelve a pedir
    await runJob({ type: "plot_forecast", farmId, plotId: plotIds[0]! }, env, { fetch: f.fetchFn, now: () => t0 + 2 * 3_600_000 });
    expect(f.urls).toHaveLength(1);
    // 4 horas después: pide de nuevo y reemplaza (sin duplicar días)
    await runJob({ type: "plot_forecast", farmId, plotId: plotIds[0]! }, env, { fetch: f.fetchFn, now: () => t0 + 4 * 3_600_000 });
    expect(f.urls).toHaveLength(2);
    const r = await call<any>("GET", `/org/farms/${farmId}/plot-forecast`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(true);
    expect(r.body.plots).toHaveLength(1);
    expect(r.body.plots[0]).toMatchObject({ plotId: plotIds[0], plotName: "Lote 1", runAt: t0 + 4 * 3_600_000 });
    const dates = r.body.plots[0].days.map((d: any) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.length).toBeGreaterThanOrEqual(9);
  });

  it("una estancia chica no hace pedidos ni muestra pronóstico por lote", async () => {
    const owner = await createOrgWithOwner();
    const farm = await call<{ id: string }>("POST", "/org/farms", { token: owner.token, body: { name: "Chica", geometry: square(-55.5, -27.2, 0.01) } });
    const plots = await call<{ ids: string[] }>("POST", `/org/farms/${farm.body.id}/plots`, { token: owner.token, body: { plots: [{ name: "A", kind: "crop", geometry: square(-55.499, -27.201, 0.005) }] } });
    const f = fakeMet();
    await runJob({ type: "plot_forecast", farmId: farm.body.id, plotId: plots.body.ids[0]! }, env, { fetch: f.fetchFn, now: Date.now });
    expect(f.urls).toHaveLength(0);
    expect((await call("GET", `/org/farms/${farm.body.id}/plot-forecast`, { token: owner.token })).body).toMatchObject({ enabled: false, plots: [] });
  });

  it("el empleado solo ve sus lotes; otra organización no ve nada", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const f = fakeMet();
    for (const plotId of plotIds) await runJob({ type: "plot_forecast", farmId, plotId }, env, { fetch: f.fetchFn, now: Date.now });
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/plot-forecast`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    const w = await call<any>("GET", `/org/farms/${farmId}/plot-forecast`, { token: worker.token });
    expect(w.body.plots.map((p: any) => p.plotId)).toEqual([plotIds[0]]);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/plot-forecast`, { token: other.token })).status).toBe(404);
  });
});
