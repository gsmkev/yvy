import { describe, expect, it } from "vitest";
import { flushVotes, readQueue, readVotes, recordVote, type Kv } from "../src/lib/votes";

const memKv = (): Kv => {
  const m = new Map<string, string>();
  return { getKv: (k) => m.get(k) ?? null, setKv: (k, v) => void (v === null ? m.delete(k) : m.set(k, v)) };
};

describe("votos de avisos", () => {
  it("guarda el voto local y lo deja en cola", () => {
    const kv = memKv();
    recordVote(kv, "a1", true);
    expect(readVotes(kv)).toEqual({ a1: true });
    expect(readQueue(kv)).toEqual({ a1: true });
  });

  it("sin señal conserva la cola; con señal la vacía", async () => {
    const kv = memKv();
    recordVote(kv, "a1", true);
    recordVote(kv, "a2", false);
    const offline = async () => {
      throw new Error("offline");
    };
    expect(await flushVotes(kv, offline, () => true)).toBe(0);
    expect(Object.keys(readQueue(kv))).toEqual(["a1", "a2"]);
    const sent: [string, boolean][] = [];
    expect(await flushVotes(kv, async (id, u) => void sent.push([id, u]), () => true)).toBe(2);
    expect(sent).toEqual([
      ["a1", true],
      ["a2", false],
    ]);
    expect(readQueue(kv)).toEqual({});
    expect(readVotes(kv)).toEqual({ a1: true, a2: false });
  });

  it("un error permanente descarta ese voto y sigue", async () => {
    const kv = memKv();
    recordVote(kv, "gone", true);
    recordVote(kv, "ok", true);
    const post = async (id: string) => {
      if (id === "gone") throw new Error("404");
    };
    expect(await flushVotes(kv, post, () => false)).toBe(1);
    expect(readQueue(kv)).toEqual({});
  });
});
