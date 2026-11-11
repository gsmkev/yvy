import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runJob } from "../src/jobs";
import { hmacHex } from "../src/lib/crypto";
import { call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const signed = async (method: string, path: string, body = "") => {
  const ts = Date.now();
  return {
    "x-yvy-timestamp": String(ts),
    "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
  };
};

afterEach(() => vi.unstubAllGlobals());

const mailEnv = { ...env, RESEND_API_KEY: "re_test", EMAIL_FROM: "Yvy <parte@yvy.test>" };

/** Captura lo que el Worker le manda a Resend. */
const captureMail = () => {
  const sent: { to: string; subject: string; text: string; attachments?: { filename: string; path: string }[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response("{}", { status: 200 });
    }),
  );
  return sent;
};

describe("R-02 · parte semanal con PDF adjunto", () => {
  it("/ingest/farms/:id/weekly-summary devuelve agregados de la semana", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 2);
    const at = Date.parse("2026-11-04T15:00:00Z");
    const row = (kind: "rain" | "note", data: unknown): typeof s.records.$inferInsert => ({
      id: newId(),
      organizationId: owner.orgId,
      farmId,
      plotId: plotIds[0],
      authorId: owner.userId,
      kind,
      data: JSON.stringify(data),
      schemaVersion: RECORD_SCHEMA_VERSION,
      capturedAt: at,
      createdAt: at,
      updatedAt: at,
      version: 1,
    });
    await db()
      .insert(s.records)
      .values([row("rain", { mm: 12, readAt: at }), row("rain", { mm: 8, readAt: at }), row("note", { text: "x" })]);
    await db().insert(s.climateDaily).values({ farmId, plotId: "", date: "2026-11-04", source: "chirps", precipMm: 30 });
    const path = `/ingest/farms/${farmId}/weekly-summary?from=2026-11-02&to=2026-11-08`;
    const res = await call("GET", path, { headers: await signed("GET", `/ingest/farms/${farmId}/weekly-summary`) });
    expect(res.status).toBe(200);
    expect(res.body.farm.name).toBe("La Esperanza");
    expect(res.body.records.total).toBe(3);
    expect(res.body.records.authors).toBe(1);
    expect(res.body.rain).toEqual({ satMm: 30, normalMm: null, gaugeMm: 20 });
    expect(res.body.plots).toHaveLength(2);
    const ghost = newId();
    const missing = await call("GET", `/ingest/farms/${ghost}/weekly-summary?from=2026-11-02&to=2026-11-08`, {
      headers: await signed("GET", `/ingest/farms/${ghost}/weekly-summary`),
    });
    expect(missing.status).toBe(404);
  });

  it("/ingest/weekly-reports registra el PDF, exige firma y ruta de reports/", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const good = JSON.stringify({ farmId, periodStart: "2026-11-02", periodEnd: "2026-11-08", storagePath: `reports/${farmId}/abc/parte.pdf` });
    expect((await call("POST", "/ingest/weekly-reports", { body: good })).status).toBe(401);
    const ok = await call("POST", "/ingest/weekly-reports", { body: good, headers: await signed("POST", "/ingest/weekly-reports", good) });
    expect(ok.status).toBe(201);
    const bad = JSON.stringify({ farmId, periodStart: "2026-11-02", periodEnd: "2026-11-08", storagePath: "../fotos/x.pdf" });
    expect((await call("POST", "/ingest/weekly-reports", { body: bad, headers: await signed("POST", "/ingest/weekly-reports", bad) })).status).toBe(400);
  });

  it("el email del lunes lleva el PDF adjunto y el enlace cuando workers-py ya lo subió", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const body = JSON.stringify({ farmId, periodStart: "2026-11-02", periodEnd: "2026-11-08", storagePath: `reports/${farmId}/abc/parte.pdf` });
    await call("POST", "/ingest/weekly-reports", { body, headers: await signed("POST", "/ingest/weekly-reports", body) });

    const sent = captureMail();
    await runJob({ type: "weekly_report", farmId }, mailEnv as never);
    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.subject).toContain("Parte semanal");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments![0]!.filename).toMatch(/^parte-.*2026-11-08\.pdf$/);
    expect(mail.attachments![0]!.path).toContain(`/yvy-media/reports/${farmId}/abc/parte.pdf`);
    expect(mail.attachments![0]!.path).toContain("X-Amz-Signature=");
    expect(mail.text).toContain(mail.attachments![0]!.path);
    expect(mail.text).toContain("/parte?desde="); // el enlace a la web sigue
  });

  it("sin PDF sale el texto con el enlace a la web, sin adjuntos", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const sent = captureMail();
    await runJob({ type: "weekly_report", farmId }, mailEnv as never);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.attachments).toBeUndefined();
    expect(sent[0]!.text).toContain("/parte?desde=");
  });

  it("un PDF viejo (de otra semana) no se adjunta", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await db().insert(s.reports).values({
      id: newId(),
      organizationId: owner.orgId,
      farmId,
      kind: "weekly",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-07",
      storagePath: "reports/x/old.pdf",
      status: "done",
      createdAt: Date.now() - 10 * 86_400_000,
    });
    const sent = captureMail();
    await runJob({ type: "weekly_report", farmId }, mailEnv as never);
    expect(sent[0]!.attachments).toBeUndefined();
  });
});
