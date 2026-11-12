/** G-13: abigeato (cabezas faltantes y denuncias). */
import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createOrgWithOwner, pullAll } from "./helpers";
import { DAY, setupHerd } from "./herd-helpers";
import { push, rec } from "./records-helpers";

describe("registro theft", () => {
  it("se guarda con potrero, categoría y cabezas; la denuncia es opcional", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const r = await push(owner.token, [
      rec(farmId, plotIds[0]!, "theft", { category: "novillo", head: 3 }),
      rec(farmId, plotIds[0]!, "theft", { category: "vaca", head: 1, policeReport: "D-123/2026", reportedAt: Date.now() }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "applied"]);
  });

  it("rechaza sin potrero, sin cabezas, categoría desconocida y denuncia vacía", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const r = await push(owner.token, [
      rec(farmId, null, "theft", { category: "vaca", head: 1 }),
      rec(farmId, plotIds[0]!, "theft", { category: "vaca", head: 0 }),
      rec(farmId, plotIds[0]!, "theft", { category: "oveja", head: 1 }),
      rec(farmId, plotIds[0]!, "theft", { category: "vaca", head: 1, policeReport: "   " }),
      rec(farmId, plotIds[0]!, "theft", { category: "vaca", head: 1.5 }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(Array(5).fill("rejected"));
  });

  it("el empleado avisa solo en sus potreros asignados", async () => {
    const { worker, farmId, plotIds } = await setupHerd();
    const r = await push(worker.token, [
      rec(farmId, plotIds[0]!, "theft", { category: "vaca", head: 2 }),
      rec(farmId, plotIds[3]!, "theft", { category: "vaca", head: 2 }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
    expect(r.body.results[1].reason).toBe("forbidden");
  });

  it("descuenta de la hacienda del potrero como la mortandad", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const A = plotIds[0]!;
    const t0 = Date.now() - 5 * DAY;
    await push(owner.token, [
      rec(farmId, A, "herd_count", { counts: { vaca: 30, novillo: 10 } }, t0),
      rec(farmId, A, "theft", { category: "novillo", head: 4 }, t0 + DAY),
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/stock`, { token: owner.token });
    expect(res.body.plots.find((p: any) => p.plotId === A).counts).toMatchObject({ vaca: 30, novillo: 6 });
  });

  it("baja al celular aunque pasen los 30 días del historial", async () => {
    const { worker, farmId, plotIds } = await setupHerd();
    const old = Date.now() - 90 * DAY;
    await push(worker.token, [rec(farmId, plotIds[0]!, "theft", { category: "vaca", head: 1 }, old)]);
    expect((await pullAll(worker.token, "records")).filter((r) => r.kind === "theft")).toHaveLength(1);
  });
});

describe("GET /org/farms/:id/theft", () => {
  it("lista los avisos, suma por categoría y cuenta los que no tienen denuncia", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "theft", { category: "novillo", head: 3 }, now - 3 * DAY),
      rec(farmId, plotIds[1]!, "theft", { category: "vaca", head: 1, policeReport: "D-9", reportedAt: now - DAY }, now - 2 * DAY),
      rec(farmId, plotIds[1]!, "theft", { category: "novillo", head: 2 }, now - 800 * DAY), // fuera del último año
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/theft`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0]).toMatchObject({ category: "vaca", head: 1, policeReport: "D-9", plotName: "Lote 2" });
    expect(res.body.rows[1]).toMatchObject({ policeReport: null, reportedAt: null });
    expect(res.body.totals).toMatchObject({ head: 4, withoutReport: 1 });
    expect(res.body.totals.byCategory).toMatchObject({ novillo: 3, vaca: 1 });
    // rango explícito
    const wide = await call<any>("GET", `/org/farms/${farmId}/theft?from=0`, { token: owner.token });
    expect(wide.body.rows).toHaveLength(3);
    expect((await call("GET", `/org/farms/${farmId}/theft?from=abc`, { token: owner.token })).status).toBe(400);
  });

  it("permisos: el empleado no lo ve, el agrónomo sí, otra organización no", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/theft`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/theft`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/theft`, { token: other.token })).status).toBe(404);
  });
});
