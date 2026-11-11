import { describe, expect, it } from "vitest";
import {
  computeStock,
  DEFAULT_MAX_UA_PER_HA,
  farmStock,
  totalHead,
  uaOf,
  uaPerHa,
  UA_EQUIVALENTS,
  type CountEvent,
  type MortalityEvent,
  type MoveEvent,
} from "../src";

const count = (plotId: string, capturedAt: number, counts: CountEvent["counts"]): CountEvent => ({
  plotId,
  capturedAt,
  counts,
});
const move = (
  fromPlotId: string | null,
  toPlotId: string | null,
  capturedAt: number,
  counts: MoveEvent["counts"],
): MoveEvent => ({ fromPlotId, toPlotId, capturedAt, counts });
const death = (plotId: string, capturedAt: number, category: MortalityEvent["category"], head: number): MortalityEvent => ({
  plotId,
  capturedAt,
  category,
  head,
});

describe("computeStock (regla del ADR 0004)", () => {
  it("último conteo + movimientos y mortandad posteriores", () => {
    const s = computeStock(
      ["A", "B"],
      [count("A", 100, { vaca: 50, toro: 2 }), count("B", 100, { vaca: 10 })],
      [move("A", "B", 200, { vaca: 20 })],
      [death("A", 300, "vaca", 1), death("B", 300, "vaca", 2)],
    );
    expect(s.get("A")!.counts).toMatchObject({ vaca: 29, toro: 2 });
    expect(s.get("B")!.counts.vaca).toBe(28);
    expect(s.get("A")!.total).toBe(31);
    expect(s.get("A")!.lastCountAt).toBe(100);
  });

  it("un conteo nuevo corrige el error acumulado e ignora lo anterior", () => {
    const s = computeStock(
      ["A"],
      [count("A", 100, { vaca: 50 }), count("A", 500, { vaca: 44 })],
      [move("A", null, 200, { vaca: 20 })],
      [death("A", 300, "vaca", 3)],
    );
    expect(s.get("A")!.counts.vaca).toBe(44);
    expect(s.get("A")!.lastCountAt).toBe(500);
  });

  it("movimientos del mismo instante del conteo ya están contados (solo cuentan los posteriores)", () => {
    const s = computeStock(["A"], [count("A", 100, { vaca: 10 })], [move("A", null, 100, { vaca: 5 })], []);
    expect(s.get("A")!.counts.vaca).toBe(10);
  });

  it("una entrada anterior al conteo del destino no se suma dos veces", () => {
    const s = computeStock(
      ["A", "B"],
      [count("A", 100, { vaca: 30 }), count("B", 300, { vaca: 25 })],
      [move("A", "B", 200, { vaca: 10 })],
      [],
    );
    expect(s.get("A")!.counts.vaca).toBe(20); // el conteo de A es anterior al movimiento: resta

    expect(s.get("B")!.counts.vaca).toBe(25);
  });

  it("sin conteo parte de cero y aplica todos los eventos; compra suma y venta resta", () => {
    const s = computeStock(
      ["A", "B"],
      [],
      [move(null, "A", 10, { novillo: 40 }), move("A", "B", 20, { novillo: 15 }), move("A", null, 30, { novillo: 5 })],
      [],
    );
    expect(s.get("A")!.counts.novillo).toBe(20);
    expect(s.get("B")!.counts.novillo).toBe(15);
    expect(s.get("A")!.lastCountAt).toBeNull();
  });

  it("nunca baja de cero por categoría", () => {
    const s = computeStock(
      ["A"],
      [count("A", 100, { vaca: 2 })],
      [move("A", null, 200, { vaca: 5, toro: 1 })],
      [death("A", 300, "vaca", 4)],
    );
    expect(s.get("A")!.counts.vaca).toBe(0);
    expect(s.get("A")!.counts.toro).toBe(0);
  });

  it("los eventos se aplican en orden de fecha aunque lleguen desordenados", () => {
    // Sale 5 (queda 5), llegan 10 (15), mueren 20 (0 por tope). Si se aplicara llegada primero daría 0 + 10 - 20 = 0 y distinto.
    const s = computeStock(
      ["A"],
      [count("A", 0, { vaca: 10 })],
      [move("A", null, 20, { vaca: 5 }), move(null, "A", 10, { vaca: 10 })],
      [death("A", 30, "vaca", 12)],
    );
    expect(s.get("A")!.counts.vaca).toBe(3);
  });

  it("potrero sin eventos queda en cero", () => {
    expect(computeStock(["A"], [], [], []).get("A")!.total).toBe(0);
  });
});

describe("carga animal", () => {
  it("UA con equivalencias por categoría", () => {
    expect(uaOf({ vaca: 10 })).toBe(10 * UA_EQUIVALENTS.vaca);
    expect(uaOf({ vaca: 10, ternero: 10, toro: 1 })).toBeCloseTo(10 + 4 + 1.3);
    expect(totalHead({ vaca: 3, toro: 1 })).toBe(4);
  });

  it("UA/ha por potrero y sin superficie", () => {
    expect(uaPerHa({ vaca: 50 }, 100)).toBe(0.5);
    expect(uaPerHa({ vaca: 50 }, 0)).toBeNull();
  });

  it("totales de la estancia sobre la superficie de todos los potreros", () => {
    const stock = computeStock(["A", "B"], [count("A", 1, { vaca: 100 }), count("B", 1, { vaca: 50, ternero: 50 })], [], []);
    const f = farmStock(stock.values(), new Map([["A", 100], ["B", 100]]));
    expect(f.total).toBe(200);
    expect(f.ua).toBeCloseTo(170);
    expect(f.uaPerHa).toBeCloseTo(0.85);
    expect(f.uaPerHa! > DEFAULT_MAX_UA_PER_HA).toBe(false);
  });
});
