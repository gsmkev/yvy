import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { areaHa } from "@yvy/geo";
import { call, createOrgWithOwner, db, square } from "./helpers";

const multi = (...polys: ReturnType<typeof square>[]) => ({
  type: "MultiPolygon" as const,
  coordinates: polys.map((p) => p.coordinates),
});

describe("estancia con varios polígonos (M-09)", () => {
  it("acepta un MultiPolygon, guarda el tipo, el bbox y la suma de las áreas", async () => {
    const owner = await createOrgWithOwner();
    const a = square(-55.9, -27.2, 0.02);
    const b = square(-55.7, -27.4, 0.03);
    const r = await call<{ id: string }>("POST", "/org/farms", {
      token: owner.token,
      body: { name: "Dos cascos", geometry: multi(a, b) },
    });
    expect(r.status).toBe(201);
    const [row] = await db().select().from(s.farms).where(eq(s.farms.id, r.body.id));
    expect(JSON.parse(row!.geometry).type).toBe("MultiPolygon");
    expect(row!.minLon).toBeCloseTo(-55.9, 6);
    expect(row!.maxLon).toBeCloseTo(-55.67, 6);
    expect(row!.minLat).toBeCloseTo(-27.43, 6);
    expect(row!.maxLat).toBeCloseTo(-27.2, 6);
    expect(row!.areaHa).toBeCloseTo(areaHa(a) + areaHa(b), 4);
  });

  it("quita la altura (Z) de las posiciones", async () => {
    const owner = await createOrgWithOwner();
    const a = square(-55.9, -27.2, 0.02);
    const withZ = { type: "MultiPolygon", coordinates: [a.coordinates.map((ring) => ring.map((p) => [...p, 120]))] };
    const r = await call<{ id: string }>("POST", "/org/farms", {
      token: owner.token,
      body: { name: "Con altura", geometry: withZ },
    });
    expect(r.status).toBe(201);
    const [row] = await db().select().from(s.farms).where(eq(s.farms.id, r.body.id));
    expect(JSON.parse(row!.geometry).coordinates[0][0][0]).toHaveLength(2);
  });

  it("rechaza un MultiPolygon con una parte sin cerrar o vacío", async () => {
    const owner = await createOrgWithOwner();
    const open = { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1]]]] };
    for (const geometry of [open, { type: "MultiPolygon", coordinates: [] }]) {
      const r = await call("POST", "/org/farms", { token: owner.token, body: { name: "Mala", geometry } });
      expect(r.status).toBe(400);
    }
  });
});
