import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@yvy/shared/schema";
import { sha256Hex } from "../src/lib/crypto";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId } = await createFarmWithPlots(owner.token, 2);
  return { owner, farmId };
}

describe("enlace de solo lectura (K-04)", () => {
  it("el dueño crea un enlace y se ve el resumen sin sesión; solo se guarda el hash", async () => {
    const { owner, farmId } = await setup();
    const created = await call<{ id: string; token: string; expiresAt: number }>(
      "POST",
      `/org/farms/${farmId}/share-links`,
      { token: owner.token, body: { days: 7 } },
    );
    expect(created.status).toBe(201);
    const { token, expiresAt } = created.body;
    expect(expiresAt - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    const [row] = await db().select().from(s.shareLinks).where(eq(s.shareLinks.id, created.body.id));
    expect(row!.tokenHash).toBe(await sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const pub = await call<any>("GET", `/public/shared/${token}`); // sin sesión
    expect(pub.status).toBe(200);
    expect(pub.body.farm).toMatchObject({ name: "La Esperanza", plotCount: 2 });
    expect(pub.body.plots).toHaveLength(2);
    expect(pub.body).toHaveProperty("rain30");
    expect(pub.body).toHaveProperty("alerts");
    // no filtra geometrías ni personas
    expect(JSON.stringify(pub.body)).not.toContain("coordinates");
    expect(JSON.stringify(pub.body)).not.toContain("Dueño");
  });

  it("duraciones: solo 7 o 30 días", async () => {
    const { owner, farmId } = await setup();
    const ok = await call("POST", `/org/farms/${farmId}/share-links`, { token: owner.token, body: { days: 30 } });
    expect(ok.status).toBe(201);
    const bad = await call("POST", `/org/farms/${farmId}/share-links`, { token: owner.token, body: { days: 90 } });
    expect(bad.status).toBe(403);
  });

  it("un enlace vencido devuelve 410", async () => {
    const { owner, farmId } = await setup();
    const { body } = await call<{ id: string; token: string }>("POST", `/org/farms/${farmId}/share-links`, {
      token: owner.token,
      body: { days: 7 },
    });
    await db()
      .update(s.shareLinks)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(s.shareLinks.id, body.id));
    const res = await call<any>("GET", `/public/shared/${body.token}`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe("expired");
  });

  it("revocar corta el acceso y es solo del dueño", async () => {
    const { owner, farmId } = await setup();
    const { body } = await call<{ id: string; token: string }>("POST", `/org/farms/${farmId}/share-links`, {
      token: owner.token,
      body: { days: 7 },
    });
    expect((await call("GET", `/public/shared/${body.token}`)).status).toBe(200);
    const admin = await addMemberAndLogin(owner.token, "admin");
    expect((await call("DELETE", `/org/share-links/${body.id}`, { token: admin.token })).status).toBe(403);
    expect((await call("GET", `/public/shared/${body.token}`)).status).toBe(200);

    expect((await call("DELETE", `/org/share-links/${body.id}`, { token: owner.token })).status).toBe(200);
    const res = await call<any>("GET", `/public/shared/${body.token}`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe("revoked");
    const list = await call<any[]>("GET", `/org/farms/${farmId}/share-links`, { token: owner.token });
    expect(list.body[0]!.revokedAt).not.toBeNull();
    expect(list.body[0]).not.toHaveProperty("token");
  });

  it("token desconocido o mal formado: 404", async () => {
    expect((await call("GET", "/public/shared/abcdefghijklmnopqrstuvwxyz")).status).toBe(404);
    expect((await call("GET", "/public/shared/corto")).status).toBe(404);
  });

  it("permisos: admin, agrónomo y empleado no crean ni listan; otra organización no ve la estancia", async () => {
    const { owner, farmId } = await setup();
    const other = await createOrgWithOwner("Otra");
    for (const role of ["admin", "agronomist", "worker"] as const) {
      const m = await addMemberAndLogin(owner.token, role);
      expect((await call("POST", `/org/farms/${farmId}/share-links`, { token: m.token, body: { days: 7 } })).status).toBe(403);
      expect((await call("GET", `/org/farms/${farmId}/share-links`, { token: m.token })).status).toBe(403);
    }
    expect((await call("POST", `/org/farms/${farmId}/share-links`, { token: other.token, body: { days: 7 } })).status).toBe(404);
  });

  it("si la estancia se borra, el enlace deja de servir", async () => {
    const { owner, farmId } = await setup();
    const { body } = await call<{ token: string }>("POST", `/org/farms/${farmId}/share-links`, {
      token: owner.token,
      body: { days: 7 },
    });
    await call("DELETE", `/org/farms/${farmId}`, { token: owner.token });
    expect((await call("GET", `/public/shared/${body.token}`)).status).toBe(404);
  });
});
