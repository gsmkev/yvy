/** Aguadas (G-30): aviso `water_low` cuando una aguada o tajamar se registra baja o seca. */
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { evaluateWater } from "../src/jobs/water";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";
import { push, rec } from "./records-helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
  const poi = async (name: string, kind = "water") =>
    (
      await call<{ id: string }>("POST", `/org/farms/${farmId}/pois`, {
        token: owner.token,
        body: { name, kind, lon: -55.9, lat: -27.2 },
      })
    ).body.id;
  return { owner, farmId, plotIds, poi };
}

const water = (farmId: string, poiId: string | null, level: string, at = Date.now() - 1000) => {
  const m = rec(farmId, null, "water", { level }, at);
  (m.row as { poiId: string | null }).poiId = poiId;
  return m;
};
const openAlerts = (farmId: string) =>
  db()
    .select()
    .from(s.alerts)
    .where(and(eq(s.alerts.farmId, farmId), eq(s.alerts.kind, "water_low"), isNull(s.alerts.resolvedAt)));

describe("evaluateWater (puro)", () => {
  const r = (poiId: string, name: string, level: string, capturedAt = 1) => ({ poiId, name, level, capturedAt });
  it("sin aguadas bajas no hay aviso", () => {
    expect(evaluateWater([r("a", "Tajamar", "full"), r("b", "Molino", "half")], [], "2026-11-10")).toBeNull();
    expect(evaluateWater([], [], "2026-11-10")).toBeNull();
  });
  it("bajo es vigilancia y seco es advertencia, con la seca primero en el resumen", () => {
    const low = evaluateWater([r("a", "Tajamar Norte", "low")], ["p1"], "2026-11-10")!;
    expect(low).toMatchObject({ kind: "water_low", severity: "watch", validFrom: "2026-11-10", validTo: "2026-11-13" });
    expect(low.summary).toBe("Aguada Tajamar Norte con nivel bajo");
    const both = evaluateWater([r("a", "Tajamar Norte", "low", 9), r("b", "Molino", "dry", 1)], ["p1"], "2026-11-10")!;
    expect(both.severity).toBe("warning");
    expect(both.summary).toBe("Aguada Molino seca (y 1 más)");
    expect(both.details.plotIds).toEqual(["p1"]);
  });
});

describe("aviso al registrar agua", () => {
  it("una aguada baja abre el aviso y varias se juntan en uno solo", async () => {
    const { owner, farmId, poi } = await setup();
    const a = await poi("Tajamar Norte");
    const b = await poi("Molino");
    let r = await push(owner.token, [water(farmId, a, "low")]);
    expect(r.body.results[0].status).toBe("applied");
    let alerts = await openAlerts(farmId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "watch", source: "Registros de aguadas" });
    expect(alerts[0]!.summary).toContain("Tajamar Norte");
    r = await push(owner.token, [water(farmId, b, "dry")]);
    alerts = await openAlerts(farmId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "warning" });
    expect(alerts[0]!.summary).toBe("Aguada Molino seca (y 1 más)");
  });

  it("G-30: bebederos y molinos también cuentan, con su nombre de tipo en el aviso", async () => {
    const { owner, farmId, poi } = await setup();
    const b = await poi("Bebedero Sur", "trough");
    const m = await poi("Molino Viejo", "mill");
    await push(owner.token, [water(farmId, b, "low", Date.now() - 2000)]);
    expect((await openAlerts(farmId))[0]!.summary).toBe("Bebedero Bebedero Sur con nivel bajo");
    await push(owner.token, [water(farmId, m, "dry", Date.now() - 1000)]);
    const alerts = await openAlerts(farmId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.summary).toBe("Molino Molino Viejo seca (y 1 más)");
    expect((JSON.parse(alerts[0]!.details as unknown as string) as { pois: { kind: string }[] }).pois.map((p) => p.kind).sort()).toEqual(["mill", "trough"]);
  });

  it("se resuelve cuando todas las aguadas vuelven a estar bien", async () => {
    const { owner, farmId, poi } = await setup();
    const a = await poi("Tajamar");
    await push(owner.token, [water(farmId, a, "dry", Date.now() - 5000)]);
    expect(await openAlerts(farmId)).toHaveLength(1);
    await push(owner.token, [water(farmId, a, "half", Date.now() - 1000)]);
    expect(await openAlerts(farmId)).toHaveLength(0);
  });

  it("solo cuentan aguadas, tajamares, bebederos y molinos, y registros ligados a un punto", async () => {
    const { owner, farmId, poi } = await setup();
    const casa = await poi("Casa", "house");
    await push(owner.token, [water(farmId, casa, "dry"), water(farmId, null, "dry")]);
    expect(await openAlerts(farmId)).toHaveLength(0);
  });

  it("no avisa con una lectura vieja (más de 7 días)", async () => {
    const { owner, farmId, poi } = await setup();
    const a = await poi("Tajamar");
    await push(owner.token, [water(farmId, a, "dry", Date.now() - 10 * 86_400_000)]);
    expect(await openAlerts(farmId)).toHaveLength(0);
  });

  it("un empleado también la dispara, y el punto tiene que ser de la estancia", async () => {
    const { owner, farmId, plotIds, poi } = await setup();
    const a = await poi("Tajamar");
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]!] } });
    const other = await createFarmWithPlots(owner.token, 1);
    const foreign = (
      await call<{ id: string }>("POST", `/org/farms/${other.farmId}/pois`, {
        token: owner.token,
        body: { name: "Otro", kind: "water", lon: -55.9, lat: -27.2 },
      })
    ).body.id;
    const r = await push(worker.token, [water(farmId, a, "low"), water(farmId, foreign, "dry")]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(["applied", "rejected"]);
    expect(await openAlerts(farmId)).toHaveLength(1);
  });

  it("la estancia muestra el último nivel de cada aguada", async () => {
    const { owner, farmId, poi } = await setup();
    const a = await poi("Tajamar");
    const b = await poi("Molino");
    await push(owner.token, [water(farmId, a, "full", Date.now() - 9000), water(farmId, a, "low", Date.now() - 1000)]);
    const d = await call<any>("GET", `/org/farms/${farmId}`, { token: owner.token });
    const pa = d.body.pois.find((p: any) => p.id === a);
    const pb = d.body.pois.find((p: any) => p.id === b);
    expect(pa.lastWaterLevel).toBe("low");
    expect(pa.lastWaterAt).toBeGreaterThan(0);
    expect(pb.lastWaterLevel).toBeNull();
  });
});
