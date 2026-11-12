import { describe, expect, it } from "vitest";
import { localDate, newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { dayOfYear } from "../src/db/queries";
import { addMemberAndLogin, call, createOrgWithOwner, db, square } from "./helpers";

async function farmWith(token: string, name: string, lon: number, plots: { crop: string | null; kind: string; size: number }[]) {
  const f = await call<{ id: string }>("POST", "/org/farms", { token, body: { name, geometry: square(lon, -27, 0.2) } });
  const r = await call<{ ids: string[] }>("POST", `/org/farms/${f.body.id}/plots`, {
    token,
    body: {
      plots: plots.map((p, i) => ({
        name: `L${i}`,
        kind: p.kind,
        crop: p.crop,
        geometry: square(lon + 0.01 + i * 0.03, -27.01, p.size),
      })),
    },
  });
  return { farmId: f.body.id, plotIds: r.body.ids };
}

describe("tablero del dueño (R-06)", () => {
  it("superficie por cultivo, lluvia del mes contra lo normal, avisos, actividad y registros", async () => {
    const owner = await createOrgWithOwner();
    const a = await farmWith(owner.token, "A", -56, [
      { crop: "soja", kind: "crop", size: 0.02 },
      { crop: "maiz", kind: "crop", size: 0.01 },
    ]);
    const b = await farmWith(owner.token, "B", -55, [
      { crop: "soja", kind: "crop", size: 0.02 },
      { crop: null, kind: "pasture", size: 0.01 },
    ]);
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [a.plotIds[0]] } });
    await addMemberAndLogin(owner.token, "worker", "Inactivo");

    // Lluvia del mes: A llovió 30 mm en dos fuentes (promedio, no suma); B no tiene datos. Normal de A: 20 mm.
    const now = Date.now();
    const today = localDate(now);
    const month = `${today.slice(0, 7)}-01`;
    await db().insert(s.climateDaily).values([
      { farmId: a.farmId, plotId: "", date: today, source: "chirps", precipMm: 30 },
      { farmId: a.farmId, plotId: "", date: today, source: "power", precipMm: 30 },
    ]);
    await db().insert(s.climatology).values(
      Array.from({ length: dayOfYear(today) - dayOfYear(month) + 1 }, (_, i) => ({
        farmId: a.farmId,
        plotId: "",
        dayOfYear: dayOfYear(month) + i,
        variable: "precip",
        mean: 20 / (dayOfYear(today) - dayOfYear(month) + 1),
      })),
    );
    // un aviso activo y uno resuelto
    const alert = (over: Partial<typeof s.alerts.$inferInsert>) => ({
      id: newId(),
      organizationId: owner.orgId,
      farmId: a.farmId,
      kind: "frost" as const,
      severity: "warning" as const,
      validFrom: now,
      validTo: now + 86_400_000,
      summary: "x",
      source: "t",
      dedupeKey: newId(),
      createdAt: now,
      updatedAt: now,
      ...over,
    });
    await db().insert(s.alerts).values([alert({}), alert({ resolvedAt: now }), alert({ validTo: now - 1000 })]);
    // actividad: el empleado anotó dos registros hoy
    const rec = () => ({
      mutationId: newId(),
      kind: "records.upsert",
      row: {
        id: newId(),
        farmId: a.farmId,
        plotId: a.plotIds[0],
        poiId: null,
        kind: "scouting",
        data: { condition: "good", note: "ok" },
        schemaVersion: RECORD_SCHEMA_VERSION,
        lon: -55.99,
        lat: -27.01,
        gpsAccuracyM: 5,
        capturedAt: now,
      },
    });
    await call("POST", "/sync/push", { token: worker.token, body: { deviceId: "d", mutations: [rec(), rec()] } });
    await call("GET", "/me", { token: worker.token }); // marca actividad

    const r = await call<any>("GET", "/org/dashboard", { token: owner.token });
    expect(r.status).toBe(200);
    const ha = (crop: string | null) => r.body.areaByCrop.find((x: { crop: string | null }) => x.crop === crop)?.ha;
    expect(ha("soja")).toBeGreaterThan(ha("maiz"));
    expect(ha("soja") / ha("maiz")).toBeCloseTo(8, 0); // soja: dos lotes de 0,02² (una por estancia) contra uno de 0,01²
    expect(r.body.areaByCrop.find((x: { kind: string }) => x.kind === "pasture")).toMatchObject({ crop: null, plots: 1 });
    expect(r.body.areaByCrop[0].crop).toBe("soja"); // de mayor a menor
    expect(r.body.rain).toMatchObject({ farmsWithData: 1, mm: 30, normalMm: 20, pctOfNormal: 150 });
    expect(r.body.alerts.total).toBe(1);
    expect(r.body.alerts.byKind).toEqual([{ kind: "frost", severity: "warning", n: 1 }]);
    expect(r.body.activity).toMatchObject({ workers: 2, activeWorkers7d: 1, staff: 1 });
    expect(r.body.records7d.total).toBe(2);
    expect(r.body.records7d.byWorkers).toBe(2);
    expect(r.body.records7d.byKind).toEqual([{ kind: "scouting", n: 2 }]);
    expect(b.farmId).toBeTruthy();
  });

  it("margen de 12 meses: ventas menos costos, solo con permiso de montos y sin filas viejas ni borradas", async () => {
    const owner = await createOrgWithOwner();
    const now = Date.now();
    const entry = (over: Partial<typeof s.costEntries.$inferInsert>) => ({
      id: newId(),
      organizationId: owner.orgId,
      occurredAt: now - 86_400_000,
      activity: "agricultura" as const,
      category: "input" as const,
      amount: 100,
      amountPyg: 100,
      createdBy: owner.userId,
      createdAt: now,
      updatedAt: now,
      ...over,
    });
    await db()
      .insert(s.costEntries)
      .values([
        entry({ category: "sale", amount: 1000, amountPyg: 1000 }),
        entry({ amount: 300, amountPyg: 300 }),
        entry({ occurredAt: now - 400 * 86_400_000, amount: 9999, amountPyg: 9999 }), // fuera de los 12 meses
        entry({ deletedAt: now, amount: 5555, amountPyg: 5555 }), // borrada
      ]);
    const r = await call<any>("GET", "/org/dashboard", { token: owner.token });
    expect(r.body.margin).toMatchObject({ incomePyg: 1000, costPyg: 300, marginPyg: 700, entries: 2 });
    const other = await createOrgWithOwner("Otra");
    expect((await call<any>("GET", "/org/dashboard", { token: other.token })).body.margin).toMatchObject({
      marginPyg: 0,
      entries: 0,
    });
    // administrador con permiso de montos también; el margen nunca llega a quien no puede ver el tablero
    const admin = await addMemberAndLogin(owner.token, "admin");
    expect((await call<any>("GET", "/org/dashboard", { token: admin.token })).body.margin.marginPyg).toBe(700);
  });

  it("sin datos devuelve ceros y lluvia nula", async () => {
    const owner = await createOrgWithOwner();
    const r = await call<any>("GET", "/org/dashboard", { token: owner.token });
    expect(r.body.areaByCrop).toEqual([]);
    expect(r.body.rain).toMatchObject({ mm: null, normalMm: null, pctOfNormal: null, farmsWithData: 0 });
    expect(r.body.alerts.total).toBe(0);
    expect(r.body.records7d.total).toBe(0);
  });

  it("permisos: dueño y administrador; agrónomo y empleado no; otra organización ve lo suyo", async () => {
    const owner = await createOrgWithOwner();
    await farmWith(owner.token, "A", -56, [{ crop: "soja", kind: "crop", size: 0.02 }]);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", "/org/dashboard", { token: admin.token })).status).toBe(200);
    expect((await call("GET", "/org/dashboard", { token: agro.token })).status).toBe(403);
    expect((await call("GET", "/org/dashboard", { token: worker.token })).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await call<any>("GET", "/org/dashboard", { token: other.token })).body.areaByCrop).toEqual([]);
  });
});
