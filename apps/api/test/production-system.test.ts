/** ADR 0005 (secciones 1 y 4): sistema productivo, indicadores y carga recomendada, con sus permisos. */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call } from "./helpers";
import { setupHerd, DAY } from "./herd-helpers";
import { push, rec } from "./records-helpers";

const put = (token: string, farmId: string, body: unknown) => call("PUT", `/org/farms/${farmId}/livestock-settings`, { token, body });

describe("sistema productivo y carga recomendada", () => {
  it("permisos: solo dueño y administrador eligen el sistema; el agrónomo lo ve, el empleado no", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const admin = await addMemberAndLogin(owner.token, "admin");
    const sup = await addMemberAndLogin(owner.token, "supervisor");
    expect((await put(worker.token, farmId, { system: "cria" })).status).toBe(403);
    expect((await put(agro.token, farmId, { system: "cria" })).status).toBe(403);
    expect((await put(sup.token, farmId, { system: "cria" })).status).toBe(403);
    expect((await put(admin.token, farmId, { system: "recria" })).status).toBe(200);
    expect((await put(owner.token, farmId, { system: "otro" })).status).toBe(400);
    expect((await put(owner.token, farmId, { pastureLoads: { natural: 0 } })).status).toBe(400);
    const stock = (t: string) => call<any>("GET", `/org/farms/${farmId}/stock`, { token: t });
    expect((await stock(agro.token)).body.system).toBe("recria");
    expect((await stock(worker.token)).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/production`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/production`, { token: agro.token })).status).toBe(200);
  });

  it("cambiar el sistema no pisa la carga máxima y viceversa", async () => {
    const { owner, farmId } = await setupHerd();
    await put(owner.token, farmId, { maxUaPerHa: 3 });
    await put(owner.token, farmId, { system: "cria" });
    const r = await call<any>("GET", `/org/farms/${farmId}/stock`, { token: owner.token });
    expect(r.body.maxUaPerHa).toBe(3);
    expect(r.body.system).toBe("cria");
  });

  it("sin sistema elegido no hay indicadores", async () => {
    const { owner, farmId } = await setupHerd();
    const r = await call<any>("GET", `/org/farms/${farmId}/production`, { token: owner.token });
    expect(r.body).toEqual({ system: null, indicators: [] });
  });

  it("cría: % preñez, parición y destete con lo registrado; lo que no tiene datos no aparece", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    await put(owner.token, farmId, { system: "cria" });
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "reproduction", { event: "service", head: 100 }, now - 120 * DAY),
      rec(farmId, plotIds[0]!, "reproduction", { event: "pregnancy_check", head: 100, pregnant: 80 }, now - 60 * DAY),
    ]);
    const r = await call<any>("GET", `/org/farms/${farmId}/production`, { token: owner.token });
    expect(r.body.indicators).toEqual([{ id: "pregnancyPct", value: 80, unit: "pct" }]);
  });

  it("carga recomendada por potrero según el tipo de pastura, con las UA que sobran o faltan", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const A = plotIds[0]!;
    await call("PATCH", `/org/plots/${A}`, { token: owner.token, body: { pastureType: "Brachiaria" } });
    await push(owner.token, [rec(farmId, A, "herd_count", { counts: { vaca: 10 } }, Date.now() - DAY)]);
    const r = await call<any>("GET", `/org/farms/${farmId}/stock`, { token: owner.token });
    const a = r.body.plots.find((p: any) => p.plotId === A);
    const b = r.body.plots.find((p: any) => p.plotId === plotIds[1]);
    expect(a.pastureClass).toBe("implantada");
    expect(b.pastureClass).toBe("natural");
    const factor = r.body.winter ? 0.7 : 1;
    expect(a.recommendedUaPerHa).toBeCloseTo(1.2 * factor, 2);
    expect(a.diffUa).toBeCloseTo(10 - a.recommendedUa, 1);
    await put(owner.token, farmId, { pastureLoads: { implantada: 2 } });
    const r2 = await call<any>("GET", `/org/farms/${farmId}/stock`, { token: owner.token });
    expect(r2.body.plots.find((p: any) => p.plotId === A).recommendedUaPerHa).toBeCloseTo(2 * factor, 2);
  });
});
