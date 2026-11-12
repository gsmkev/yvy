import { describe, expect, it } from "vitest";
import { POI_KINDS, t } from "@yvy/shared";
import { call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

describe("tipos de punto de interés (M-19)", () => {
  it("incluye silo, galpón, tranquera, puente, molino, bebedero, manga y embarcadero", () => {
    for (const k of ["silo", "shed", "gate", "bridge", "mill", "trough", "chute", "dock", "school"])
      expect(POI_KINDS).toContain(k);
  });

  it("todos los tipos tienen texto en es-PY", () => {
    for (const k of POI_KINDS) expect(t(`ui.poiKinds_${k}` as never)).not.toBe(`ui.poiKinds_${k}`);
  });

  it("la API acepta cada tipo nuevo y rechaza uno desconocido", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    for (const kind of ["silo", "shed", "bridge", "mill", "trough", "chute", "dock", "school"]) {
      const r = await call("POST", `/org/farms/${farmId}/pois`, {
        token: owner.token,
        body: { kind, name: kind, lon: -55.89, lat: -27.21 },
      });
      expect(r.status).toBe(201);
    }
    const bad = await call("POST", `/org/farms/${farmId}/pois`, {
      token: owner.token,
      body: { kind: "helipuerto", name: "x", lon: -55.89, lat: -27.21 },
    });
    expect(bad.status).toBe(400);
  });
});
