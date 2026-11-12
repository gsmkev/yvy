import { describe, expect, it } from "vitest";
import { areaHa } from "@yvy/geo";
import { addMemberAndLogin, call, createOrgWithOwner, pullAll, square } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const farm = await call<{ id: string }>("POST", "/org/farms", {
    token: owner.token,
    body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.1) },
  });
  const plot = (name: string, lon: number) => ({ name, kind: "crop", geometry: square(lon, -27.21, 0.01) });
  const r = await call<{ ids: string[] }>("POST", `/org/farms/${farm.body.id}/plots`, {
    token: owner.token,
    body: { plots: [plot("A", -55.89), plot("B", -55.87), plot("C", -55.85)] },
  });
  return { owner, farmId: farm.body.id, ids: r.body.ids };
}

describe("editar los vértices de un lote (M-02)", () => {
  it("guarda la forma nueva, recalcula superficie y bbox, y el cambio baja por el sync", async () => {
    const { owner, ids } = await setup();
    const before = (await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!;
    const next = square(-55.89, -27.21, 0.015);
    const r = await call<{ ok: boolean; areaHa: number; warnings: unknown[] }>("PATCH", `/org/plots/${ids[0]}`, {
      token: owner.token,
      body: { geometry: next },
    });
    expect(r.status).toBe(200);
    expect(r.body.areaHa).toBeCloseTo(areaHa(next), 6);
    expect(r.body.warnings).toEqual([]);
    const after = (await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!;
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.areaHa).toBeCloseTo(areaHa(next), 6);
    expect(after.areaHa).toBeGreaterThan(before.areaHa);
    expect(after.maxLon).toBeCloseTo(-55.89 + 0.015, 9);
    expect(JSON.parse(after.geometry).coordinates[0]).toHaveLength(5);
  });

  it("M-09: un lote con dos partes se guarda como MultiPolygon con la suma de áreas y el bbox de ambas", async () => {
    const { owner, ids } = await setup();
    const a = square(-55.89, -27.21, 0.01);
    const b = square(-55.84, -27.25, 0.012);
    const next = { type: "MultiPolygon", coordinates: [a.coordinates, b.coordinates] };
    const r = await call<{ areaHa: number }>("PATCH", `/org/plots/${ids[0]}`, { token: owner.token, body: { geometry: next } });
    expect(r.status).toBe(200);
    expect(r.body.areaHa).toBeCloseTo(areaHa(a) + areaHa(b), 4);
    const after = (await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!;
    expect(JSON.parse(after.geometry).type).toBe("MultiPolygon");
    expect(after.minLon).toBeCloseTo(-55.89, 9);
    expect(after.maxLon).toBeCloseTo(-55.84 + 0.012, 9);
    expect(after.minLat).toBeCloseTo(-27.25 - 0.012, 9);
  });

  it("avisa si el lote editado pisa a un vecino o se sale del perímetro, sin bloquear", async () => {
    const { owner, ids } = await setup();
    const over = await call<{ warnings: any[] }>("PATCH", `/org/plots/${ids[0]}`, {
      token: owner.token,
      body: { geometry: square(-55.89, -27.21, 0.03) }, // llega hasta -55.86 y pisa a B
    });
    expect(over.status).toBe(200);
    expect(over.body.warnings).toEqual([expect.objectContaining({ kind: "overlap", plotName: "B" })]);
    expect(over.body.warnings[0].plotId).toBe(ids[1]);
    const out = await call<{ warnings: any[] }>("PATCH", `/org/plots/${ids[2]}`, {
      token: owner.token,
      body: { geometry: square(-55.5, -27.21, 0.01) },
    });
    expect(out.status).toBe(200);
    expect(out.body.warnings).toEqual([expect.objectContaining({ kind: "outside" })]);
  });

  it("rechaza geometrías mal formadas o demasiado chicas y no toca el lote", async () => {
    const { owner, ids } = await setup();
    const open = { type: "Polygon", coordinates: [[[-55.89, -27.21], [-55.88, -27.21], [-55.88, -27.22], [-55.89, -27.22]]] };
    for (const geometry of [open, { type: "Point", coordinates: [0, 0] }, square(-55.89, -27.21, 0.0001)]) {
      const r = await call("PATCH", `/org/plots/${ids[0]}`, { token: owner.token, body: { geometry } });
      expect(r.status).toBe(400);
    }
    const same = (await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!;
    expect(same.areaHa).toBeGreaterThan(1);
  });

  it("editar solo el nombre no recalcula ni devuelve avisos", async () => {
    const { owner, ids } = await setup();
    const r = await call<Record<string, unknown>>("PATCH", `/org/plots/${ids[0]}`, {
      token: owner.token,
      body: { name: "Lote norte" },
    });
    expect(r.body).toEqual({ ok: true });
  });

  it("permisos: el empleado no edita; otra organización no ve el lote; el agrónomo sí edita", async () => {
    const { owner, ids } = await setup();
    const worker = await addMemberAndLogin(owner.token, "worker");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const stranger = await createOrgWithOwner("Otra");
    const body = { geometry: square(-55.89, -27.21, 0.012) };
    expect((await call("PATCH", `/org/plots/${ids[0]}`, { token: worker.token, body })).status).toBe(403);
    expect((await call("PATCH", `/org/plots/${ids[0]}`, { token: stranger.token, body })).status).toBe(404);
    expect((await call("PATCH", `/org/plots/${ids[0]}`, { token: agro.token, body })).status).toBe(200);
  });
});
