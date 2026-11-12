/** E-37: foto de la factura o el ticket en un movimiento de stock o un costo (flujo firmado de R2). */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@yvy/shared";
import { call, createOrgWithOwner } from "./helpers";
import { buy, erpGet, erpPost, stockSetup } from "./erp-helpers";

async function withMove() {
  const s = await stockSetup();
  const move = await buy(s.owner.token, s, 10, 100_000);
  return { ...s, moveId: move.body.id as string };
}
const key = (orgId: string, kind: string, id: string) => `organizations/${orgId}/erp/${kind}/${id}.webp`;
const url = (kind: string, id: string, suffix: string) => `/org/erp/photos/${kind}/${id}/${suffix}`;

describe("foto de la factura (E-37)", () => {
  it("sube con URL firmada, confirma y baja con URL firmada (movimiento de stock)", async () => {
    const s = await withMove();
    const up = await call<any>("POST", url("stock-moves", s.moveId, "upload-url"), { token: s.owner.token });
    expect(up.status).toBe(200);
    expect(up.body.url).toContain(`organizations/${s.owner.orgId}/erp/stock-moves/${s.moveId}.webp`);
    expect(up.body.url).toContain("X-Amz-Signature");
    // sin subir todavía no se puede confirmar ni bajar
    expect((await call("POST", url("stock-moves", s.moveId, "uploaded"), { token: s.owner.token })).status).toBe(409);
    expect((await call("GET", `/org/erp/photos/stock-moves/${s.moveId}`, { token: s.owner.token })).status).toBe(404);
    await env.MEDIA.put(key(s.owner.orgId, "stock-moves", s.moveId), new Uint8Array(2000));
    expect((await call("POST", url("stock-moves", s.moveId, "uploaded"), { token: s.owner.token })).status).toBe(200);
    const moves = (await erpGet<any[]>(s.owner.token, "stock/moves")).body;
    expect(moves[0].photoPath).toBe(key(s.owner.orgId, "stock-moves", s.moveId));
    const down = await call<any>("GET", `/org/erp/photos/stock-moves/${s.moveId}`, { token: s.owner.token });
    expect(down.status).toBe(200);
    expect(down.body.url).toContain("X-Amz-Signature");
  });

  it("también en un costo; una foto demasiado grande se rechaza y se borra", async () => {
    const s = await withMove();
    const cost = await erpPost(s.owner.token, "costs", { date: "2026-11-05", activity: "agricultura", category: "other", amount: 50_000, currency: "PYG" });
    const k = key(s.owner.orgId, "cost-entries", cost.body.id);
    expect((await call("POST", url("cost-entries", cost.body.id, "upload-url"), { token: s.owner.token })).status).toBe(200);
    await env.MEDIA.put(k, new Uint8Array(LIMITS.photos.maxBytes + 1));
    expect((await call("POST", url("cost-entries", cost.body.id, "uploaded"), { token: s.owner.token })).status).toBe(413);
    expect(await env.MEDIA.head(k)).toBeNull();
    await env.MEDIA.put(k, new Uint8Array(1000));
    expect((await call("POST", url("cost-entries", cost.body.id, "uploaded"), { token: s.owner.token })).status).toBe(200);
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows[0].photoPath).toBe(k);
    expect((await call("DELETE", `/org/erp/photos/cost-entries/${cost.body.id}`, { token: s.owner.token })).status).toBe(200);
    expect(await env.MEDIA.head(k)).toBeNull();
    expect((await erpGet<any>(s.owner.token, "costs")).body.rows[0].photoPath).toBeNull();
  });

  it("solo dueño y administrador; el agrónomo no ve ni la ruta de la foto; otra organización no accede", async () => {
    const s = await withMove();
    await env.MEDIA.put(key(s.owner.orgId, "stock-moves", s.moveId), new Uint8Array(100));
    await call("POST", url("stock-moves", s.moveId, "uploaded"), { token: s.admin.token });
    for (const t of [s.agro.token, s.worker.token]) {
      expect((await call("POST", url("stock-moves", s.moveId, "upload-url"), { token: t })).status).toBe(403);
      expect((await call("GET", `/org/erp/photos/stock-moves/${s.moveId}`, { token: t })).status).toBe(403);
      expect((await call("DELETE", `/org/erp/photos/stock-moves/${s.moveId}`, { token: t })).status).toBe(403);
    }
    expect((await erpGet<any[]>(s.agro.token, "stock/moves")).body[0]).not.toHaveProperty("photoPath");
    const other = await createOrgWithOwner("Otra");
    expect((await call("POST", url("stock-moves", s.moveId, "upload-url"), { token: other.token })).status).toBe(404);
    expect((await call("GET", `/org/erp/photos/stock-moves/${s.moveId}`, { token: other.token })).status).toBe(404);
    expect((await call("POST", url("facturas", s.moveId, "upload-url"), { token: s.owner.token })).status).toBe(400);
  });
});
