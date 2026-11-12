/** G-20: reproducción (servicio, tacto, parición, destete) e índices. */
import { describe, expect, it } from "vitest";
import { parseRecordData, reproIndices } from "@yvy/shared";
import { addMemberAndLogin, call, createOrgWithOwner } from "./helpers";
import { DAY, setupHerd } from "./herd-helpers";
import { push, rec } from "./records-helpers";

describe("reproIndices (puro)", () => {
  it("preñez, parición y destete con los totales del período", () => {
    const i = reproIndices([
      { event: "service", head: 100 },
      { event: "service", head: 50 },
      { event: "pregnancy_check", head: 140, pregnant: 112 },
      { event: "calving", head: 60, calves: 62 }, // mellizos
      { event: "calving", head: 30 }, // sin dato de terneros: uno por vaca
      { event: "weaning", head: 80 },
    ]);
    expect(i).toMatchObject({ services: 150, checked: 140, pregnant: 112, calvedCows: 90, calvesBorn: 92, weaned: 80 });
    expect(i.pregnancyPct).toBe(80);
    expect(i.calvingPct).toBe(61.3);
    expect(i.weaningPct).toBe(87);
  });
  it("sin denominador no hay índice", () => {
    expect(reproIndices([])).toMatchObject({ pregnancyPct: null, calvingPct: null, weaningPct: null });
    expect(reproIndices([{ event: "weaning", head: 5 }]).weaningPct).toBeNull();
  });
  it("las preñadas nunca pasan de las tactadas", () => {
    expect(reproIndices([{ event: "pregnancy_check", head: 10, pregnant: 25 }]).pregnancyPct).toBe(100);
  });
});

describe("registro reproduction", () => {
  it("valida el evento y sus datos", () => {
    const ok = (d: unknown) => parseRecordData("reproduction", d).success;
    expect(ok({ event: "service", head: 40, method: "ia" })).toBe(true);
    expect(ok({ event: "pregnancy_check", head: 40, pregnant: 31 })).toBe(true);
    expect(ok({ event: "calving", head: 1, calves: 2, tag: "py-9" })).toBe(true);
    expect(ok({ event: "weaning", head: 25 })).toBe(true);
    expect(ok({ event: "pregnancy_check", head: 40 })).toBe(false); // falta cuántas preñadas
    expect(ok({ event: "pregnancy_check", head: 10, pregnant: 11 })).toBe(false);
    expect(ok({ event: "service", head: 0 })).toBe(false);
    expect(ok({ event: "aborto", head: 1 })).toBe(false);
    expect(ok({ event: "service", head: 3, tag: "AB1" })).toBe(false); // con caravana es un solo animal
    expect(ok({ event: "service", method: "toro" })).toBe(false);
  });

  it("con caravana y sin cabezas cuenta una", () => {
    const r = parseRecordData("reproduction", { event: "service", tag: "py-9" });
    expect(r.success && (r.data as { head: number; tag: string })).toMatchObject({ head: 1, tag: "PY-9" });
  });

  it("el empleado carga en sus potreros o sin potrero, no en los ajenos", async () => {
    const { worker, farmId, plotIds } = await setupHerd();
    const r = await push(worker.token, [
      rec(farmId, plotIds[0]!, "reproduction", { event: "service", head: 10 }),
      rec(farmId, plotIds[3]!, "reproduction", { event: "service", head: 10 }),
      rec(farmId, plotIds[1]!, "reproduction", { event: "pregnancy_check", head: 10 }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected", "rejected"]);
    expect(r.body.results[1].reason).toBe("forbidden");
    expect(r.body.results[2].reason).toBe("invalid");
  });
});

describe("GET /org/farms/:id/reproduction", () => {
  it("devuelve índices del período y los últimos eventos con el potrero", async () => {
    const { owner, farmId, plotIds } = await setupHerd();
    const now = Date.now();
    await push(owner.token, [
      rec(farmId, plotIds[0]!, "reproduction", { event: "service", head: 100, method: "natural" }, now - 200 * DAY),
      rec(farmId, plotIds[0]!, "reproduction", { event: "pregnancy_check", head: 100, pregnant: 85 }, now - 120 * DAY),
      rec(farmId, plotIds[0]!, "reproduction", { event: "calving", head: 40 }, now - 20 * DAY),
      rec(farmId, null, "reproduction", { event: "weaning", head: 10 }, now - 5 * DAY),
      rec(farmId, null, "reproduction", { event: "service", head: 999 }, now - 800 * DAY), // fuera del año
    ]);
    const res = await call<any>("GET", `/org/farms/${farmId}/reproduction`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body.indices).toMatchObject({ pregnancyPct: 85, calvingPct: 40, weaningPct: 25 });
    expect(res.body.rows).toHaveLength(4);
    expect(res.body.rows[0]).toMatchObject({ event: "weaning", plotName: null });
    expect(res.body.rows[3]).toMatchObject({ event: "service", plotName: "Lote 1", method: "natural" });
  });

  it("permisos: no es para el empleado; no mezcla organizaciones", async () => {
    const { owner, worker, farmId } = await setupHerd();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    expect((await call("GET", `/org/farms/${farmId}/reproduction`, { token: worker.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/reproduction`, { token: agro.token })).status).toBe(200);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/reproduction`, { token: other.token })).status).toBe(404);
  });
});
