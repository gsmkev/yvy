import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS, type WebhookPayload } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { deliverWebhook, drainOutbox, webhookRetryDelay, webhookUrlProblem } from "../src/db/webhooks";
import { hmacHex } from "../src/lib/crypto";
import { upsertAlert } from "../src/jobs/alerts";
import type { AlertDraft } from "../src/jobs/rules";
import type { JobMessage } from "../src/types";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";
import { push, rec } from "./records-helpers";

afterEach(() => vi.restoreAllMocks());

const URL_OK = "https://hooks.cliente.com.py/yvy";
const create = (token: string, events: string[] = ["alert.created", "record.created"], url = URL_OK) =>
  call<{ id: string; secret: string }>("POST", "/org/webhooks", { token, body: { url, events } });

const draft = (): AlertDraft => ({
  kind: "frost",
  severity: "warning",
  probability: "high",
  validFrom: "2026-11-12",
  validTo: "2026-11-12",
  summary: "Helada probable",
  details: {},
});

type WebhookMsg = Extract<JobMessage, { type: "webhook" }>;
const fakeJobs = () => {
  const sent: JobMessage[] = [];
  const JOBS = { sendBatch: async (m: { body: JobMessage }[]) => void sent.push(...m.map((x) => x.body)) } as unknown as Queue<JobMessage>;
  return { sent, JOBS };
};

describe("permisos (I-02)", () => {
  it("solo dueño y administrador gestionan los webhooks", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin", "Admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist", "Agro");
    const worker = await addMemberAndLogin(owner.token, "worker");
    for (const who of [agro, worker]) {
      expect((await call("GET", "/org/webhooks", { token: who.token })).status).toBe(403);
      expect((await create(who.token)).status).toBe(403);
    }
    const mine = await create(admin.token);
    expect(mine.status).toBe(201);
    for (const who of [agro, worker]) {
      expect((await call("PATCH", `/org/webhooks/${mine.body.id}`, { token: who.token, body: { enabled: false } })).status).toBe(403);
      expect((await call("DELETE", `/org/webhooks/${mine.body.id}`, { token: who.token })).status).toBe(403);
      expect((await call("POST", `/org/webhooks/${mine.body.id}/test`, { token: who.token })).status).toBe(403);
    }
    expect((await call<any[]>("GET", "/org/webhooks", { token: owner.token })).body).toHaveLength(1);
  });

  it("un webhook de otra organización no se ve ni se toca", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const hook = await create(a.token);
    expect((await call<any[]>("GET", "/org/webhooks", { token: b.token })).body).toHaveLength(0);
    expect((await call("DELETE", `/org/webhooks/${hook.body.id}`, { token: b.token })).status).toBe(404);
    expect((await call("PATCH", `/org/webhooks/${hook.body.id}`, { token: b.token, body: { enabled: false } })).status).toBe(404);
  });
});

describe("alta y panel", () => {
  it("valida la URL: solo https con dominio público", async () => {
    const owner = await createOrgWithOwner();
    for (const url of ["http://x.com/a", "https://localhost/a", "https://10.0.0.1/a", "https://servidor/a", "https://api.interno.local/a", "nada"])
      expect((await create(owner.token, ["alert.created"], url)).status).toBe(400);
    expect(webhookUrlProblem(URL_OK)).toBeNull();
    expect(webhookUrlProblem("https://user:pw@x.com/a")).toBe("invalid");
    expect((await call("POST", "/org/webhooks", { token: owner.token, body: { url: URL_OK, events: ["otro"] } })).status).toBe(400);
    expect((await call("POST", "/org/webhooks", { token: owner.token, body: { url: URL_OK, events: [] } })).status).toBe(400);
  });

  it("el secreto sale una sola vez y en la base queda cifrado", async () => {
    const owner = await createOrgWithOwner();
    const r = await create(owner.token);
    expect(r.body.secret).toMatch(/^whsec_/);
    const list = await call<any[]>("GET", "/org/webhooks", { token: owner.token });
    expect(JSON.stringify(list.body)).not.toContain(r.body.secret);
    expect(list.body[0]).toMatchObject({ url: URL_OK, enabled: true, lastStatus: null, events: ["alert.created", "record.created"] });
    const [row] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, r.body.id));
    expect(row!.secretEnc).not.toContain(r.body.secret);
  });

  it("tope por organización, edición y borrado", async () => {
    const owner = await createOrgWithOwner();
    let last = "";
    for (let i = 0; i < LIMITS.webhooks.maxPerOrg; i++) last = (await create(owner.token)).body.id;
    expect((await create(owner.token)).status).toBe(409);
    expect((await call("PATCH", `/org/webhooks/${last}`, { token: owner.token, body: { events: ["record.created"], enabled: false } })).status).toBe(200);
    const [h] = (await call<any[]>("GET", "/org/webhooks", { token: owner.token })).body.filter((x) => x.id === last);
    expect(h).toMatchObject({ enabled: false, events: ["record.created"] });
    expect((await call("DELETE", `/org/webhooks/${last}`, { token: owner.token })).status).toBe(200);
    expect((await create(owner.token)).status).toBe(201);
  });
});

describe("entrega firmada con reintentos", () => {
  const setup = async () => {
    const owner = await createOrgWithOwner();
    const hook = await create(owner.token);
    const payload: WebhookPayload = { id: "evt-1", event: "record.created", createdAt: 1_700_000_000_000, organizationId: owner.orgId, data: { id: "r1" } };
    const msg: WebhookMsg = { type: "webhook", endpointId: hook.body.id, payload: JSON.stringify(payload) };
    return { owner, hook: hook.body, msg, payload };
  };

  it("firma HMAC-SHA256 de '<t>.<cuerpo>' en X-Yvy-Signature y deja 'ok'", async () => {
    const { hook, msg } = await setup();
    const fetchFn = vi.fn(async (_u: unknown, _i?: RequestInit) => new Response(null, { status: 204 }));
    const now = 1_700_000_005_000;
    await deliverWebhook(env, db(), msg, fetchFn as unknown as typeof fetch, now);
    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(URL_OK);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.body).toBe(msg.payload);
    const h = init.headers as Record<string, string>;
    expect(h["x-yvy-event"]).toBe("record.created");
    expect(h["x-yvy-delivery"]).toBe("evt-1");
    expect(h["x-yvy-signature"]).toBe(`t=${now},v1=${await hmacHex(hook.secret, `${now}.${msg.payload}`)}`);
    const [row] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, hook.id));
    expect(row).toMatchObject({ lastStatus: "ok", lastHttpStatus: 204, lastAttemptAt: now, lastSuccessAt: now, consecutiveFailures: 0 });
  });

  it("un no-2xx o un error de red lanzan (la cola reintenta) y anotan el último estado", async () => {
    const { hook, msg } = await setup();
    await expect(deliverWebhook(env, db(), msg, (async () => new Response("no", { status: 500 })) as typeof fetch, 10)).rejects.toThrow(/HTTP 500/);
    let [row] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, hook.id));
    expect(row).toMatchObject({ lastStatus: "error", lastHttpStatus: 500, lastError: "HTTP 500", consecutiveFailures: 1 });
    await expect(
      deliverWebhook(env, db(), msg, (async () => {
        throw new Error("connect refused");
      }) as typeof fetch, 20),
    ).rejects.toThrow();
    [row] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, hook.id));
    expect(row).toMatchObject({ lastStatus: "error", lastHttpStatus: null, lastError: "connect refused", consecutiveFailures: 2 });
    // un envío bueno limpia la racha
    await deliverWebhook(env, db(), msg, (async () => new Response(null, { status: 200 })) as typeof fetch, 30);
    [row] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, hook.id));
    expect(row).toMatchObject({ lastStatus: "ok", consecutiveFailures: 0, lastError: null });
  });

  it("se pausa tras demasiados fallos seguidos y se puede reactivar", async () => {
    const { owner, hook, msg } = await setup();
    const bad = (async () => new Response("", { status: 502 })) as typeof fetch;
    for (let i = 0; i < LIMITS.webhooks.disableAfterFailures; i++) await deliverWebhook(env, db(), msg, bad, i).catch(() => {});
    const [row] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, hook.id));
    expect(row!.enabled).toBe(false);
    // pausado: ya no se envía
    const fetchFn = vi.fn();
    await deliverWebhook(env, db(), msg, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
    await call("PATCH", `/org/webhooks/${hook.id}`, { token: owner.token, body: { enabled: true } });
    const [again] = await db().select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, hook.id));
    expect(again).toMatchObject({ enabled: true, consecutiveFailures: 0 });
  });

  it("un webhook borrado no recibe nada", async () => {
    const { owner, hook, msg } = await setup();
    await call("DELETE", `/org/webhooks/${hook.id}`, { token: owner.token });
    const fetchFn = vi.fn();
    await deliverWebhook(env, db(), msg, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("la espera crece con cada reintento", () => {
    expect([1, 2, 3, 4].map(webhookRetryDelay)).toEqual([30, 300, 1800, 1800]);
  });

  it("'Enviar prueba' manda un ping por la cola", async () => {
    const { owner, hook } = await setup();
    const send = vi.spyOn(env.JOBS, "send").mockResolvedValue({} as never);
    expect((await call("POST", `/org/webhooks/${hook.id}/test`, { token: owner.token })).status).toBe(202);
    const body = send.mock.calls[0]![0] as WebhookMsg;
    expect(body).toMatchObject({ type: "webhook", endpointId: hook.id });
    expect(JSON.parse(body.payload).event).toBe("ping");
  });
});

describe("eventos", () => {
  it("registro nuevo: sale por la cola solo si es nuevo y la organización lo pidió", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const sendBatch = vi.spyOn(env.JOBS, "sendBatch").mockResolvedValue({} as never);
    // sin webhooks: no sale nada
    await push(owner.token, [rec(farmId, plotIds[0]!, "note", { text: "uno" })]);
    expect(sendBatch).not.toHaveBeenCalled();

    const hook = await create(owner.token, ["record.created"]);
    const m = rec(farmId, plotIds[0]!, "note", { text: "dos" });
    expect((await push(owner.token, [m])).status).toBe(200);
    expect(sendBatch).toHaveBeenCalledTimes(1);
    const msg = (sendBatch.mock.calls[0]![0] as { body: WebhookMsg }[])[0]!.body;
    expect(msg.endpointId).toBe(hook.body.id);
    expect(JSON.parse(msg.payload)).toMatchObject({ event: "record.created", organizationId: owner.orgId, data: { id: m.row.id, kind: "note", farmId } });
    // editar el mismo registro no es un registro nuevo
    await push(owner.token, [{ ...m, mutationId: crypto.randomUUID(), row: { ...m.row, data: { text: "dos editado" } } }]);
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it("un webhook que pide solo avisos no recibe registros", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    await create(owner.token, ["alert.created"]);
    const sendBatch = vi.spyOn(env.JOBS, "sendBatch").mockResolvedValue({} as never);
    await push(owner.token, [rec(farmId, plotIds[0]!, "note", { text: "x" })]);
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("aviso nuevo: va al buzón en el mismo batch y el cron lo pasa a la cola; una actualización no repite", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const farm = { id: farmId, organizationId: owner.orgId };
    // sin webhooks no se escribe nada en el buzón
    await upsertAlert(db(), farm, { ...draft(), validFrom: "2026-11-10", validTo: "2026-11-10" });
    expect(await db().select().from(s.webhookOutbox)).toHaveLength(0);

    const hook = await create(owner.token, ["alert.created"]);
    await upsertAlert(db(), farm, draft());
    const box = await db().select().from(s.webhookOutbox);
    expect(box).toHaveLength(1);
    expect(JSON.parse(box[0]!.payload)).toMatchObject({ kind: "frost", farmId, summary: "Helada probable" });
    // el mismo aviso con la severidad subida es una actualización: no hay evento nuevo
    await upsertAlert(db(), farm, { ...draft(), severity: "warning", summary: "Helada muy probable" });
    expect(await db().select().from(s.webhookOutbox)).toHaveLength(1);

    const jobs = fakeJobs();
    expect(await drainOutbox(jobs, db())).toBe(1);
    expect(await db().select().from(s.webhookOutbox)).toHaveLength(0);
    const m = jobs.sent[0] as WebhookMsg;
    expect(m.endpointId).toBe(hook.body.id);
    expect(JSON.parse(m.payload)).toMatchObject({ event: "alert.created", organizationId: owner.orgId });
  });
});
