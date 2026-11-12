import { describe, expect, it } from "vitest";
import { call, createOrgWithOwner, square } from "./helpers";

describe("avisos al crear lotes (M-10)", () => {
  it("devuelve warnings de superposición y de lote fuera, sin bloquear el alta", async () => {
    const owner = await createOrgWithOwner();
    const farm = await call<{ id: string }>("POST", "/org/farms", {
      token: owner.token,
      body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.1) },
    });
    const plot = (name: string, lon: number) => ({ name, kind: "crop", geometry: square(lon, -27.21, 0.01) });
    const r = await call<{ ids: string[]; warnings: any[] }>("POST", `/org/farms/${farm.body.id}/plots`, {
      token: owner.token,
      body: { plots: [plot("A", -55.89), plot("B", -55.885), plot("C", -55.5)] },
    });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(3);
    expect(r.body.warnings).toEqual([
      expect.objectContaining({ kind: "overlap", plot: 0, other: 1 }),
      expect.objectContaining({ kind: "outside", plot: 2 }),
    ]);
  });

  it("sin problemas devuelve warnings vacío", async () => {
    const owner = await createOrgWithOwner();
    const farm = await call<{ id: string }>("POST", "/org/farms", {
      token: owner.token,
      body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.1) },
    });
    const r = await call<{ warnings: unknown[] }>("POST", `/org/farms/${farm.body.id}/plots`, {
      token: owner.token,
      body: { plots: [{ name: "A", kind: "crop", geometry: square(-55.89, -27.21, 0.01) }] },
    });
    expect(r.status).toBe(201);
    expect(r.body.warnings).toEqual([]);
  });
});
