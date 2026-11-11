import { describe, expect, it } from "vitest";
import { addMemberAndLogin, call, createOrgWithOwner, square } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const farm = await call<{ id: string }>("POST", "/org/farms", {
    token: owner.token,
    body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.1) },
  });
  const plots = await call<{ ids: string[] }>("POST", `/org/farms/${farm.body.id}/plots`, {
    token: owner.token,
    body: { plots: [{ name: "A", kind: "crop", geometry: square(-55.89, -27.21, 0.02) }] },
  });
  return { owner, farmId: farm.body.id, plotId: plots.body.ids[0]! };
}

// Un grado de latitud ~ 111 km
const line = { type: "LineString", coordinates: [[-55.85, -27.25], [-55.85, -27.24]] };

describe("líneas del mapa (M-20)", () => {
  it("crea una línea con su largo, la lista y la borra", async () => {
    const { owner, farmId } = await setup();
    const r = await call<{ id: string; lengthM: number }>("POST", `/org/farms/${farmId}/lines`, {
      token: owner.token,
      body: { kind: "fence", name: "Alambrado norte", geometry: line },
    });
    expect(r.status).toBe(201);
    expect(r.body.lengthM).toBeGreaterThan(1100);
    expect(r.body.lengthM).toBeLessThan(1120);
    const list = await call<any[]>("GET", `/org/farms/${farmId}/lines`, { token: owner.token });
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: "Alambrado norte", kind: "fence" });
    expect((await call("PATCH", `/org/lines/${r.body.id}`, { token: owner.token, body: { name: "Norte", kind: "road" } })).status).toBe(200);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/lines`, { token: owner.token })).body[0]).toMatchObject({ name: "Norte", kind: "road" });
    expect((await call("DELETE", `/org/lines/${r.body.id}`, { token: owner.token })).status).toBe(200);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/lines`, { token: owner.token })).body).toEqual([]);
  });

  it("rechaza geometrías que no son una línea válida", async () => {
    const { owner, farmId } = await setup();
    const bad = [
      { type: "Point", coordinates: [0, 0] },
      { type: "LineString", coordinates: [[0, 0]] },
      { type: "LineString", coordinates: [[0, 0], [200, 0]] },
      square(-55.85, -27.25, 0.01),
    ];
    for (const geometry of bad) {
      const r = await call("POST", `/org/farms/${farmId}/lines`, { token: owner.token, body: { kind: "pipe", name: "X", geometry } });
      expect(r.status).toBe(400);
    }
    expect((await call("POST", `/org/farms/${farmId}/lines`, { token: owner.token, body: { kind: "otra", name: "X", geometry: line } })).status).toBe(400);
  });

  it("el empleado solo ve las líneas de estancias donde tiene lotes y no puede escribir", async () => {
    const { owner, farmId, plotId } = await setup();
    const made = await call<{ id: string }>("POST", `/org/farms/${farmId}/lines`, {
      token: owner.token,
      body: { kind: "fence", name: "Alambrado", geometry: line },
    });
    const worker = await addMemberAndLogin(owner.token, "worker");
    expect((await call("GET", `/org/farms/${farmId}/lines`, { token: worker.token })).status).toBe(404);
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [plotId] } });
    expect((await call<any[]>("GET", `/org/farms/${farmId}/lines`, { token: worker.token })).body).toHaveLength(1);
    const body = { kind: "pipe", name: "X", geometry: line };
    expect((await call("POST", `/org/farms/${farmId}/lines`, { token: worker.token, body })).status).toBe(403);
    expect((await call("PATCH", `/org/lines/${made.body.id}`, { token: worker.token, body: { name: "Y" } })).status).toBe(403);
    expect((await call("DELETE", `/org/lines/${made.body.id}`, { token: worker.token })).status).toBe(403);
  });

  it("el agrónomo puede editar y otra organización no ve nada", async () => {
    const { owner, farmId } = await setup();
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Ing. Gómez");
    const r = await call<{ id: string }>("POST", `/org/farms/${farmId}/lines`, {
      token: agro.token,
      body: { kind: "road", name: "Camino", geometry: line },
    });
    expect(r.status).toBe(201);
    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/lines`, { token: other.token })).status).toBe(404);
    expect((await call("DELETE", `/org/lines/${r.body.id}`, { token: other.token })).status).toBe(404);
    expect((await call("POST", `/org/farms/${farmId}/lines`, { token: other.token, body: { kind: "road", name: "Z", geometry: line } })).status).toBe(404);
  });

  it("al borrar la estancia se borran sus líneas", async () => {
    const { owner, farmId } = await setup();
    await call("POST", `/org/farms/${farmId}/lines`, { token: owner.token, body: { kind: "fence", name: "A", geometry: line } });
    expect((await call("DELETE", `/org/farms/${farmId}`, { token: owner.token })).status).toBe(200);
    const { db } = await import("./helpers");
    const s = await import("@yvy/shared/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db().select().from(s.farmLines).where(eq(s.farmLines.farmId, farmId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).not.toBeNull();
  });
});
