import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { LIMITS } from "@yvy/shared/limits";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDb, kvGet, kvSet } from "./db";
import { bustFor, createIdbPersister, fitToBudget, queryPersistence, shouldPersist } from "./persist";
import { clearLocalData } from "./clear";

const session = (org: string, user = "u1") => ({ user: { id: user }, organization: { id: org } });

const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

async function settle(p: ReturnType<typeof createIdbPersister>) {
  await p.flush();
}

beforeEach(async () => {
  await deleteDb();
});

describe("copia de lecturas en IndexedDB", () => {
  it("guarda lo visitado y lo restaura en otro arranque", async () => {
    const a = client();
    await a.prefetchQuery({ queryKey: ["farm", "f1"], queryFn: async () => ({ name: "Estancia Uno", plots: [1, 2, 3] }) });
    await a.prefetchQuery({ queryKey: ["tasks", { farmId: "f1" }], queryFn: async () => [{ id: "t1" }] });
    const pa = queryPersistence(a, createIdbPersister({ throttleMs: 5 }));
    await pa.start(bustFor(session("o1")));
    a.setQueryData(["farm", "f1"], { name: "Estancia Uno", plots: [1, 2, 3, 4] }); // un cambio dispara el guardado
    await settle(pa.persister);

    const b = client(); // "otro arranque": cliente nuevo, sin nada en memoria
    const pb = queryPersistence(b, createIdbPersister());
    await pb.start(bustFor(session("o1")));
    expect(b.getQueryData(["farm", "f1"])).toEqual({ name: "Estancia Uno", plots: [1, 2, 3, 4] });
    expect(b.getQueryData(["tasks", { farmId: "f1" }])).toEqual([{ id: "t1" }]);
    pa.stop();
    pb.stop();
  });

  it("no guarda ERP, administración ni consultas con error", async () => {
    const a = client();
    await a.prefetchQuery({ queryKey: ["erp", "stock"], queryFn: async () => [{ monto: 123456 }] });
    await a.prefetchQuery({ queryKey: ["admin-metrics"], queryFn: async () => ({ x: 1 }) });
    await a.prefetchQuery({ queryKey: ["api-tokens"], queryFn: async () => [{ token: "yvy_secreto" }] });
    await a.prefetchQuery({ queryKey: ["farms"], queryFn: async () => [{ id: "f1" }] });
    await a.prefetchQuery({ queryKey: ["broken"], queryFn: async () => Promise.reject(new Error("x")) });
    const pa = queryPersistence(a, createIdbPersister({ throttleMs: 5 }));
    await pa.start(bustFor(session("o1")));
    a.setQueryData(["farms"], [{ id: "f1" }]);
    await settle(pa.persister);
    const saved = await kvGet<PersistedClient>("rq:cache");
    const keys = saved!.clientState.queries.map((q) => q.queryKey[0]);
    expect(keys).toEqual(["farms"]);
    expect(JSON.stringify(saved)).not.toContain("yvy_secreto");
    expect(JSON.stringify(saved)).not.toContain("123456");
    pa.stop();
  });

  it("otra organización u otra versión no ve la copia (buster)", async () => {
    const a = client();
    a.setQueryData(["farms"], [{ id: "de-la-org-1" }]);
    const pa = queryPersistence(a, createIdbPersister({ throttleMs: 5 }));
    await pa.start(bustFor(session("o1")));
    a.setQueryData(["farms"], [{ id: "de-la-org-1" }, { id: "otra" }]);
    await settle(pa.persister);
    pa.stop();

    const otherOrg = client();
    await queryPersistence(otherOrg, createIdbPersister()).start(bustFor(session("o2")));
    expect(otherOrg.getQueryData(["farms"])).toBeUndefined();

    // el buster distinto también la borró: ya no queda ni para la organización original
    expect(await kvGet("rq:cache")).toBeUndefined();
  });

  it("otra persona en la misma organización tampoco", async () => {
    const a = client();
    const pa = queryPersistence(a, createIdbPersister({ throttleMs: 5 }));
    await pa.start(bustFor(session("o1", "u1")));
    a.setQueryData(["farms"], [{ id: "x" }]);
    await settle(pa.persister);
    pa.stop();
    const b = client();
    await queryPersistence(b, createIdbPersister()).start(bustFor(session("o1", "u2")));
    expect(b.getQueryData(["farms"])).toBeUndefined();
  });

  it("descarta lo que pasó de la vigencia (30 días)", async () => {
    const a = client();
    const p = createIdbPersister({ throttleMs: 5 });
    const pa = queryPersistence(a, p);
    await pa.start(bustFor(session("o1")));
    a.setQueryData(["farms"], [{ id: "f1" }]);
    await settle(p);
    pa.stop();
    const saved = (await kvGet<PersistedClient>("rq:cache"))!;
    await kvSet("rq:cache", { ...saved, timestamp: Date.now() - LIMITS.webOffline.queryCacheMaxAgeMs - 1000 });
    const b = client();
    await queryPersistence(b, createIdbPersister()).start(bustFor(session("o1")));
    expect(b.getQueryData(["farms"])).toBeUndefined();
  });

  it("junta los cambios seguidos y escribe lo último", async () => {
    const p = createIdbPersister({ throttleMs: 30 });
    const mk = (n: number): PersistedClient => ({ timestamp: n, buster: "b", clientState: { mutations: [], queries: [] } });
    p.persistClient(mk(1));
    p.persistClient(mk(2));
    p.persistClient(mk(3));
    expect(await kvGet("rq:cache")).toBeUndefined(); // todavía no escribió
    await new Promise((r) => setTimeout(r, 120));
    expect((await kvGet<PersistedClient>("rq:cache"))?.timestamp).toBe(3);
  });

  it("borrar todo lo local elimina la copia", async () => {
    await kvSet("rq:cache", { algo: 1 });
    await clearLocalData();
    expect(await kvGet("rq:cache")).toBeUndefined();
  });
});

describe("tope de tamaño", () => {
  const q = (key: string, n: number) =>
    ({ queryKey: [key], queryHash: key, state: { data: "x".repeat(n), status: "success" } }) as unknown as PersistedClient["clientState"]["queries"][number];
  const pc = (...queries: PersistedClient["clientState"]["queries"]): PersistedClient => ({
    timestamp: 1,
    buster: "b",
    clientState: { mutations: [], queries },
  });

  it("no toca lo que entra", () => {
    const c = pc(q("a", 100), q("b", 100));
    expect(fitToBudget(c, 1000)).toEqual({ client: c, dropped: 0 });
  });
  it("saca primero las más pesadas hasta entrar", () => {
    const { client: out, dropped } = fitToBudget(pc(q("chica", 100), q("enorme", 5000), q("mediana", 800)), 1500);
    expect(dropped).toBe(1);
    expect(out.clientState.queries.map((x) => x.queryKey[0])).toEqual(["chica", "mediana"]);
  });
  it("shouldPersist exige éxito y una clave permitida", () => {
    expect(shouldPersist({ queryKey: ["farm", "1"], state: { status: "success" } } as never)).toBe(true);
    expect(shouldPersist({ queryKey: ["farm", "1"], state: { status: "error" } } as never)).toBe(false);
    expect(shouldPersist({ queryKey: ["erp", "x"], state: { status: "success" } } as never)).toBe(false);
  });
});
