import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { LocalDb } from "../src/db/store";
import { addVertex, checkDraft, moveVertex, removeVertex, verticesOf, type V } from "../src/lib/plotDraft";
import { nodeSql } from "./node-sql";

const ORG = newId();
const FARM = newId();

const setup = () => {
  const db = new LocalDb(nodeSql(), () => Date.now());
  db.migrate();
  return db;
};

const SQUARE: V[] = [[-55.9, -27.2], [-55.89, -27.2], [-55.89, -27.21], [-55.9, -27.21]];

describe("M-03 · lotes dibujados en el celular", () => {
  it("agrega vértices al final al dibujar y en el lado más cercano al editar", () => {
    expect(addVertex(SQUARE, [-55.88, -27.25], false)).toHaveLength(5);
    expect(addVertex(SQUARE, [-55.88, -27.25], false)[4]).toEqual([-55.88, -27.25]);
    // cerca del lado de abajo (entre el vértice 2 y el 3)
    const withEdge = addVertex(SQUARE, [-55.895, -27.2105], true);
    expect(withEdge[3]).toEqual([-55.895, -27.2105]);
    expect(withEdge).toHaveLength(5);
    // cerca del lado de cierre (entre el último y el primero)
    expect(addVertex(SQUARE, [-55.9005, -27.205], true)[4]).toEqual([-55.9005, -27.205]);
    expect(addVertex(SQUARE.slice(0, 2), [0, 0], true)).toHaveLength(3);
    expect(moveVertex(SQUARE, 1, [0, 0])[1]).toEqual([0, 0]);
    expect(removeVertex(SQUARE, 0)).toHaveLength(3);
  });

  it("valida: pocos vértices, borde que se cruza, lote diminuto y lote válido", () => {
    expect(checkDraft(SQUARE.slice(0, 2))).toEqual({ error: "too_few" });
    expect(checkDraft([SQUARE[0]!, SQUARE[2]!, SQUARE[1]!, SQUARE[3]!])).toEqual({ error: "self_intersection" });
    expect(checkDraft([[-55.9, -27.2], [-55.8999, -27.2], [-55.8999, -27.2001]])).toEqual({ error: "too_small" });
    const ok = checkDraft(SQUARE);
    expect("polygon" in ok && ok.ha).toBeGreaterThan(90);
    expect("polygon" in ok && ok.polygon.coordinates[0]).toHaveLength(5);
  });

  it("verticesOf devuelve el anillo sin cierre y rechaza lotes con huecos o varias partes", () => {
    const poly = { type: "Polygon" as const, coordinates: [[...SQUARE, SQUARE[0]!]] };
    expect(verticesOf(poly)).toEqual(SQUARE);
    expect(verticesOf({ type: "Polygon", coordinates: [poly.coordinates[0]!, poly.coordinates[0]!] })).toBeNull();
    expect(verticesOf({ type: "MultiPolygon", coordinates: [poly.coordinates] })).toBeNull();
  });

  it("guardar: fila local con área y bbox + mutación plots.upsert en la misma transacción", async () => {
    const db = setup();
    const ok = checkDraft(SQUARE);
    if (!("polygon" in ok)) throw new Error("debería ser válido");
    const id = db.savePlot(ORG, { farmId: FARM, name: "  Lote del fondo ", kind: "crop", crop: "soja", geometry: ok.polygon });
    expect(db.plots(FARM)).toMatchObject([{ id, name: "Lote del fondo", kind: "crop", crop: "soja", minLon: -55.9, maxLon: -55.89 }]);
    expect(db.plots(FARM)[0]!.areaHa).toBeCloseTo(ok.ha, 3);
    const muts = await db.pendingMutations(10);
    expect(muts).toHaveLength(1);
    expect(muts[0]).toMatchObject({ kind: "plots.upsert", row: { id, farmId: FARM, name: "Lote del fondo", crop: "soja" } });
    expect(db.outboxItems()[0]).toMatchObject({ what: "plot", plotId: id });

    // editar: mismo id, otro nombre y tipo; un potrero no lleva cultivo
    db.savePlot(ORG, { id, farmId: FARM, name: "Potrero", kind: "pasture", crop: "soja", geometry: ok.polygon });
    expect(db.plots(FARM)).toHaveLength(1);
    expect(db.plots(FARM)[0]).toMatchObject({ name: "Potrero", kind: "pasture", crop: null });
    expect((await db.pendingMutations(10)).length).toBeGreaterThan(0);
  });
});
