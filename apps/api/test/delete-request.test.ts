/** P-09: pedido de baja de la cuenta (solo dueño, no borra nada). */
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { app } from "../src/app";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const requestsOf = (orgId: string) =>
  db().select().from(s.deletionRequests).where(eq(s.deletionRequests.organizationId, orgId));

describe("P-09 · pedir la baja de la cuenta", () => {
  it("el dueño la registra una sola vez, sin borrar datos", async () => {
    const owner = await createOrgWithOwner("Agro Baja");
    await createFarmWithPlots(owner.token, 1);
    const first = await call("POST", "/org/delete-request", { token: owner.token, body: {} });
    expect(first.status).toBe(201);
    const again = await call("POST", "/org/delete-request", { token: owner.token, body: {} });
    expect(again.status).toBe(200);
    expect(again.body.requestId).toBe(first.body.requestId);
    const rows = await requestsOf(owner.orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: owner.userId, status: "pending" });
    expect((await call("GET", "/org/farms", { token: owner.token })).body).toHaveLength(1);
  });

  it("admin, agrónomo y empleado no pueden", async () => {
    const owner = await createOrgWithOwner();
    for (const role of ["admin", "agronomist", "worker"] as const) {
      const m = await addMemberAndLogin(owner.token, role);
      expect((await call("POST", "/org/delete-request", { token: m.token, body: {} })).status, role).toBe(403);
    }
    expect(await requestsOf(owner.orgId)).toHaveLength(0);
  });

  it("funciona con la prueba vencida y avisa a OPS_EMAIL", async () => {
    const owner = await createOrgWithOwner("Agro Vencida");
    await db()
      .update(s.organizations)
      .set({ plan: "trial", trialEndsAt: Date.now() - 1000 })
      .where(eq(s.organizations.id, owner.orgId));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await app.request(
      "/org/delete-request",
      {
        method: "POST",
        headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
        body: "{}",
      },
      { ...env, OPS_EMAIL: "ops@yvy.test", RESEND_API_KEY: "" },
    );
    expect(res.status).toBe(201);
    expect(log.mock.calls.flat().join("\n")).toContain("ops@yvy.test");
  });

  it("la demo no puede pedir la baja", async () => {
    const owner = await createOrgWithOwner();
    await db().update(s.organizations).set({ plan: "demo" }).where(eq(s.organizations.id, owner.orgId));
    expect((await call("POST", "/org/delete-request", { token: owner.token, body: {} })).status).toBe(403);
  });
});
