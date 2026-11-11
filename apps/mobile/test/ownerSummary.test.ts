import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { LocalDb } from "../src/db/store";
import { MEMBERS_TTL_MS, memberNames, refreshMemberNames } from "../src/lib/members";
import { authorName, isOwnerMode, recordsByAuthor, vigorDrops } from "../src/lib/ownerSummary";
import { nodeSql } from "./node-sql";

describe("modo dueño", () => {
  it("dueño, administrador y agrónomo; el empleado no", () => {
    expect(["owner", "admin", "agronomist"].map(isOwnerMode)).toEqual([true, true, true]);
    expect(isOwnerMode("worker")).toBe(false);
    expect(isOwnerMode(undefined)).toBe(false);
  });

  it("lotes que empeoraron: compara las dos últimas pasadas y respeta el umbral", () => {
    const d = (n: number) => n * 86_400_000;
    const drops = vigorDrops([
      { plotId: "a", mean: 0.8, acquiredAt: d(10) },
      { plotId: "a", mean: 0.6, acquiredAt: d(20) }, // -25 % contra la anterior
      { plotId: "a", mean: 0.3, acquiredAt: d(1) }, // pasada más vieja: no cuenta
      { plotId: "b", mean: 0.7, acquiredAt: d(10) },
      { plotId: "b", mean: 0.65, acquiredAt: d(20) }, // -7 %: no avisa
      { plotId: "c", mean: 0.5, acquiredAt: d(20) }, // una sola pasada
      { plotId: "d", mean: 0.8, acquiredAt: d(10) },
      { plotId: "d", mean: 0.9, acquiredAt: d(20) }, // mejoró
      { plotId: "z", mean: 0.8, acquiredAt: d(10) },
      { plotId: "z", mean: 0.4, acquiredAt: d(20) }, // -50 %: el primero
    ]);
    expect(drops.map((w) => [w.plotId, w.pct, w.since])).toEqual([
      ["z", 50, d(10)],
      ["a", 25, d(10)],
    ]);
  });

  it("registros de hoy por empleado, de más a menos", () => {
    const rs = [
      { authorId: "u1", capturedAt: 100 },
      { authorId: "u2", capturedAt: 100 },
      { authorId: "u2", capturedAt: 200 },
      { authorId: "u1", capturedAt: 1 }, // de ayer
    ];
    expect(recordsByAuthor(rs, 50)).toEqual([
      { authorId: "u2", count: 2 },
      { authorId: "u1", count: 1 },
    ]);
  });

  it("nombre del autor: Vos, el nombre bajado o un texto neutro", () => {
    expect(authorName("me", "me", {})).toBe("Vos");
    expect(authorName("u1", "me", { u1: "Juan Pérez" })).toBe("Juan Pérez");
    expect(authorName("u9", "me", {})).toBe("Alguien del equipo");
  });
});

describe("nombres de miembros", () => {
  const mk = () => {
    const db = new LocalDb(nodeSql());
    db.migrate();
    return db;
  };
  it("se guardan y no se vuelven a pedir hasta que vencen; un error deja los anteriores", async () => {
    const db = mk();
    let calls = 0;
    const ok = async () => {
      calls++;
      return [{ userId: "u1", fullName: "Juan" }];
    };
    expect(await refreshMemberNames(db, ok, 1000)).toBe(true);
    expect(memberNames(db)).toEqual({ u1: "Juan" });
    expect(await refreshMemberNames(db, ok, 2000)).toBe(false);
    expect(calls).toBe(1);
    const fail = async () => {
      throw new Error("Sin señal");
    };
    expect(await refreshMemberNames(db, fail, 1000 + MEMBERS_TTL_MS + 1)).toBe(false);
    expect(memberNames(db)).toEqual({ u1: "Juan" });
  });
});

describe("pasadas de vigor locales", () => {
  it("trae solo las dos últimas de cada lote", async () => {
    const db = new LocalDb(nodeSql());
    db.migrate();
    const ORG = newId();
    const plot = newId();
    const row = (acquiredAt: number, mean: number) => ({
      id: newId(),
      organizationId: ORG,
      plotId: plot,
      sceneId: newId(),
      acquiredAt,
      idx: "ndvi",
      mean,
      p10: 0,
      p90: 1,
      validPct: 100,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      version: 1,
    });
    await db.applyPull("plot_index_stats", [row(1, 0.5), row(2, 0.6), row(3, 0.7)], { version: 1, id: "x" });
    expect(db.lastTwoVigorPasses().map((p) => p.acquiredAt).sort()).toEqual([2, 3]);
  });
});
