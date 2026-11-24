import { describe, expect, it } from "vitest";
import type { Farm } from "../src/db/store";
import { byFarm, resolveFarmChoice } from "../src/lib/farmChoice";

const farm = (id: string) => ({ id, name: id }) as unknown as Farm;

describe("resolveFarmChoice", () => {
  it("con una sola estancia con lotes no hay selector", () => {
    const c = resolveFarmChoice([farm("a"), farm("b")], [{ farmId: "a" }], "b");
    expect(c.multi).toBe(false);
    expect(c.current).toBeNull();
  });
  it("con dos usa la guardada, o la primera si no existe", () => {
    const farms = [farm("a"), farm("b"), farm("c")];
    const plots = [{ farmId: "a" }, { farmId: "b" }];
    expect(resolveFarmChoice(farms, plots, "b").current?.id).toBe("b");
    expect(resolveFarmChoice(farms, plots, "c").current?.id).toBe("a");
    expect(resolveFarmChoice(farms, plots, null).options.map((f) => f.id)).toEqual(["a", "b"]);
  });
  it("byFarm filtra solo con id", () => {
    const rows = [{ farmId: "a" }, { farmId: "b" }];
    expect(byFarm(rows, "a")).toHaveLength(1);
    expect(byFarm(rows, null)).toHaveLength(2);
  });
});
