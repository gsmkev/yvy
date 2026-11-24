/** ADR 0005 (sección 2): recordatorios de las campañas oficiales de SENACSA en el cron diario. */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { runJob, scheduled, CRONS } from "../src/jobs";
import { push, rec } from "./records-helpers";
import { setupHerd } from "./herd-helpers";
import { addMemberAndLogin, call, db } from "./helpers";
import { senacsaNote } from "@yvy/shared";

/** Mediodía de Paraguay del día dado. */
const at = (iso: string) => Date.parse(`${iso}T12:00:00-03:00`);
const deps = (now: number) => ({ fetch: (async () => Response.json({})) as typeof fetch, now: () => now });
const run = (farmId: string, iso: string) => runJob({ type: "senacsa", farmId }, env, deps(at(iso)));
const alerts = (farmId: string) => db().select().from(s.alerts).where(and(eq(s.alerts.farmId, farmId), eq(s.alerts.kind, "senacsa")));

async function withHerd() {
  const ctx = await setupHerd();
  await push(ctx.owner.token, [rec(ctx.farmId, ctx.plotIds[0]!, "herd_count", { counts: { vaca: 50 } }, at("2026-01-10"))]);
  return ctx;
}

describe("recordatorios de SENACSA", () => {
  it("14 días antes de abrir, al abrir y sin repetirse (clave por estancia, período y tipo)", async () => {
    const { farmId } = await withHerd();
    await run(farmId, "2026-02-03");
    await run(farmId, "2026-02-03");
    await run(farmId, "2026-02-10");
    let a = await alerts(farmId);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ severity: "info", source: "SENACSA, calendario oficial de vacunación" });
    expect(a[0]!.summary).toContain("aftosa");
    expect(a[0]!.summary).toContain("17/02");
    await run(farmId, "2026-02-17");
    await run(farmId, "2026-02-18");
    a = await alerts(farmId);
    expect(a.map((x) => x.severity).sort()).toEqual(["info", "watch"]);
  });

  it("avisa a dueño y administrador por push y email", async () => {
    const { farmId, owner } = await withHerd();
    await run(farmId, "2026-02-17");
    const [al] = await alerts(farmId);
    const n = await db().select().from(s.notifications).where(eq(s.notifications.alertId, al!.id));
    expect(n.map((x) => x.channel).sort()).toEqual(["email", "push"]);
    expect(owner.userId).toBe(n[0]!.userId);
  });

  it("7 días antes del cierre avisa solo si no registró la vacunación", async () => {
    const a = await withHerd();
    const b = await withHerd();
    await push(b.owner.token, [rec(b.farmId, b.plotIds[0]!, "health", { reason: "aftosa", product: "x", counts: { vaca: 50 } }, at("2026-02-25")), rec(b.farmId, b.plotIds[0]!, "health", { reason: "brucelosis", product: "x", counts: { ternero: 5 } }, at("2026-02-25"))]);
    await run(a.farmId, "2026-03-21");
    await run(b.farmId, "2026-03-21");
    const closing = async (id: string) => (await alerts(id)).filter((x) => x.severity === "warning");
    expect(await closing(a.farmId)).toHaveLength(1);
    expect((await closing(a.farmId))[0]!.summary).toContain("28/03");
    expect(await closing(b.farmId)).toHaveLength(0);
  });

  it("sin hacienda registrada o fuera de las fechas no hay aviso", async () => {
    const empty = await setupHerd();
    await run(empty.farmId, "2026-02-17");
    expect(await alerts(empty.farmId)).toHaveLength(0);
    const { farmId } = await withHerd();
    await run(farmId, "2026-01-20");
    await run(farmId, "2026-07-10");
    expect(await alerts(farmId)).toHaveLength(0);
  });

  it("el cron diario manda un mensaje por estancia", async () => {
    const sent: unknown[] = [];
    const fake = { ...env, JOBS: { sendBatch: async (m: unknown[]) => void sent.push(...m) } } as unknown as typeof env;
    await withHerd();
    await scheduled({ cron: CRONS.drought }, fake, deps(at("2026-02-17")));
    expect(JSON.stringify(sent)).toContain('"type":"senacsa"');
  });
});


describe("GET /org/senacsa", () => {
  it("devuelve las campañas solo si hay hacienda y marca las ya planificadas", async () => {
    const empty = await setupHerd();
    const none = await call<any>("GET", "/org/senacsa?year=2026", { token: empty.owner.token });
    expect(none.body).toEqual({ campaigns: [], planned: [] });
    const { owner } = await withHerd();
    const r = await call<any>("GET", "/org/senacsa?year=2026", { token: owner.token });
    expect(r.body.campaigns).toHaveLength(4);
    expect(r.body.planned).toEqual([]);
    const c = r.body.campaigns[0];
    const post = await call("POST", "/org/sanitary-events", {
      token: owner.token,
      body: { reason: c.reason, plannedDate: c.from, categories: c.categories, note: senacsaNote(c), createTasks: false },
    });
    expect(post.status).toBe(201);
    const after = await call<any>("GET", "/org/senacsa?year=2026", { token: owner.token });
    expect(after.body.planned).toEqual([c.id]);
    expect((await call("GET", "/org/senacsa?year=2026", { token: (await addMemberAndLogin(owner.token, "worker")).token })).status).toBe(403);
  });
});
