import { describe, expect, it } from "vitest";
import { areaHa, mergePolygons, splitPolygon } from "@yvy/geo";
import { addMemberAndLogin, call, createOrgWithOwner, pullAll, square } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const farm = await call<{ id: string }>("POST", "/org/farms", {
    token: owner.token,
    body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.1) },
  });
  const r = await call<{ ids: string[] }>("POST", `/org/farms/${farm.body.id}/plots`, {
    token: owner.token,
    body: {
      plots: [
        { name: "Norte", kind: "crop", crop: "soja", season: "zafra", geometry: square(-55.89, -27.21, 0.02) },
        { name: "Este", kind: "crop", crop: "soja", season: "zafra", geometry: square(-55.87, -27.21, 0.02) },
      ],
    },
  });
  return { owner, farmId: farm.body.id, ids: r.body.ids };
}

const cut = { type: "LineString" as const, coordinates: [[-55.88, -27.3], [-55.88, -27.0]] };

describe("dividir un lote (M-05)", () => {
  it("crea dos lotes con los datos del original, borra el original y baja por el sync", async () => {
    const { owner, ids } = await setup();
    const original = (await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!;
    const split = splitPolygon(JSON.parse(original.geometry), cut);
    if (!split.ok) throw new Error(split.error);
    const r = await call<{ ids: string[] }>("POST", `/org/plots/${ids[0]}/split`, {
      token: owner.token,
      body: { parts: [{ name: "Norte A", geometry: split.parts[0] }, { name: "Norte B", geometry: split.parts[1] }] },
    });
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(2);
    const rows = await pullAll(owner.token, "plots");
    const gone = rows.find((p) => p.id === ids[0])!;
    expect(gone.deletedAt).not.toBeNull();
    const made = rows.filter((p) => r.body.ids.includes(p.id));
    expect(made.map((p) => p.name).sort()).toEqual(["Norte A", "Norte B"]);
    expect(made.every((p) => p.crop === "soja" && p.season === "zafra" && p.deletedAt === null)).toBe(true);
    expect(made[0]!.areaHa + made[1]!.areaHa).toBeCloseTo(original.areaHa, 2);
    // El otro lote no se toca
    expect(rows.find((p) => p.id === ids[1])!.deletedAt).toBeNull();
  });

  it("los empleados asignados al original reciben las dos partes y el original se les quita", async () => {
    const { owner, ids } = await setup();
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [ids[0]] } });
    const original = (await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!;
    const split = splitPolygon(JSON.parse(original.geometry), cut);
    if (!split.ok) throw new Error(split.error);
    const r = await call<{ ids: string[] }>("POST", `/org/plots/${ids[0]}/split`, {
      token: owner.token,
      body: { parts: [{ name: "A", geometry: split.parts[0] }, { name: "B", geometry: split.parts[1] }] },
    });
    const assignments = await pullAll(owner.token, "plot_assignments");
    const mine = assignments.filter((a) => a.userId === worker.userId && a.deletedAt === null);
    expect(mine.map((a) => a.plotId).sort()).toEqual([...r.body.ids].sort());
    expect(assignments.find((a) => a.plotId === ids[0] && a.userId === worker.userId)!.deletedAt).not.toBeNull();
  });

  it("rechaza partes que no suman la superficie del original y no toca nada", async () => {
    const { owner, ids } = await setup();
    const r = await call("POST", `/org/plots/${ids[0]}/split`, {
      token: owner.token,
      body: { parts: [{ name: "A", geometry: square(-55.89, -27.21, 0.005) }, { name: "B", geometry: square(-55.88, -27.21, 0.005) }] },
    });
    expect(r.status).toBe(400);
    expect((await pullAll(owner.token, "plots")).find((p) => p.id === ids[0])!.deletedAt).toBeNull();
  });

  it("un empleado no puede dividir, y otra organización no ve el lote", async () => {
    const { owner, ids } = await setup();
    const worker = await addMemberAndLogin(owner.token, "worker");
    const body = { parts: [{ name: "A", geometry: square(-55.89, -27.21, 0.01) }, { name: "B", geometry: square(-55.88, -27.21, 0.01) }] };
    expect((await call("POST", `/org/plots/${ids[0]}/split`, { token: worker.token, body })).status).toBe(403);
    const other = await createOrgWithOwner("Otra");
    expect((await call("POST", `/org/plots/${ids[0]}/split`, { token: other.token, body })).status).toBe(404);
  });
});

describe("unir lotes (M-05)", () => {
  it("crea un lote con la unión, borra los dos originales y reparte las asignaciones", async () => {
    const { owner, ids } = await setup();
    const worker = await addMemberAndLogin(owner.token, "worker");
    await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds: [ids[1]] } });
    const rows = await pullAll(owner.token, "plots");
    const [a, b] = ids.map((id) => JSON.parse(rows.find((p) => p.id === id)!.geometry));
    // Los dos cuadrados del setup están separados por 0 grados: -55.89+0.02 = -55.87 → comparten borde
    const m = mergePolygons(a, b);
    if (!m.ok) throw new Error(m.error);
    const r = await call<{ ids: string[] }>("POST", "/org/plots/merge", {
      token: owner.token,
      body: { ids: [ids[0], ids[1]], name: "Norte y Este", geometry: m.polygon },
    });
    expect(r.status).toBe(201);
    const after = await pullAll(owner.token, "plots");
    expect(after.filter((p) => ids.includes(p.id)).every((p) => p.deletedAt !== null)).toBe(true);
    const merged = after.find((p) => p.id === r.body.ids[0])!;
    expect(merged.name).toBe("Norte y Este");
    expect(merged.areaHa).toBeCloseTo(areaHa(m.polygon), 6);
    expect(merged.crop).toBe("soja");
    const assignments = await pullAll(owner.token, "plot_assignments");
    expect(assignments.some((x) => x.plotId === r.body.ids[0] && x.userId === worker.userId && x.deletedAt === null)).toBe(true);
  });

  it("rechaza lotes de otra estancia, repetidos o con superficie incoherente", async () => {
    const { owner, ids, farmId } = await setup();
    const farm2 = await call<{ id: string }>("POST", "/org/farms", {
      token: owner.token,
      body: { name: "Otra", geometry: square(-54.9, -27.2, 0.1) },
    });
    const p2 = await call<{ ids: string[] }>("POST", `/org/farms/${farm2.body.id}/plots`, {
      token: owner.token,
      body: { plots: [{ name: "X", kind: "crop", geometry: square(-54.89, -27.21, 0.02) }] },
    });
    const g = square(-55.89, -27.21, 0.04);
    expect((await call("POST", "/org/plots/merge", { token: owner.token, body: { ids: [ids[0], p2.body.ids[0]], name: "M", geometry: g } })).status).toBe(400);
    expect((await call("POST", "/org/plots/merge", { token: owner.token, body: { ids: [ids[0], ids[0]], name: "M", geometry: g } })).status).toBe(400);
    expect((await call("POST", "/org/plots/merge", { token: owner.token, body: { ids: [ids[0], ids[1]], name: "M", geometry: square(-55.89, -27.21, 0.1) } })).status).toBe(400);
    expect(farmId).toBeTruthy();
  });

  it("un empleado no puede unir lotes", async () => {
    const { owner, ids } = await setup();
    const worker = await addMemberAndLogin(owner.token, "worker");
    const r = await call("POST", "/org/plots/merge", {
      token: worker.token,
      body: { ids: [ids[0], ids[1]], name: "M", geometry: square(-55.89, -27.21, 0.04) },
    });
    expect(r.status).toBe(403);
  });
});
