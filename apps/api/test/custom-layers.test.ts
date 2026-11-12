import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { addMemberAndLogin, call, createOrgWithOwner, square } from "./helpers";
import { hmacHex } from "../src/lib/crypto";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const TIFF = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 2, 3]);
const CORNERS = JSON.stringify([
  [-55.9, -27.2],
  [-55.8, -27.2],
  [-55.8, -27.3],
  [-55.9, -27.3],
]);

async function signedIngest(method: string, path: string, payload?: unknown) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const ts = Date.now();
  return app.request(
    path,
    {
      method,
      headers: {
        "content-type": "application/json",
        "x-yvy-timestamp": String(ts),
        "x-yvy-signature": await hmacHex(env.INGEST_SECRET, `${ts}.${method}.${path}.${body}`),
      },
      body: body || undefined,
    },
    env,
  );
}

async function setup() {
  const owner = await createOrgWithOwner();
  const farm = await call<{ id: string }>("POST", "/org/farms", {
    token: owner.token,
    body: { name: "La Esperanza", geometry: square(-55.9, -27.2, 0.1) },
  });
  return { owner, farmId: farm.body.id };
}

const upload = (
  token: string,
  farmId: string,
  body: Uint8Array,
  opts: { type?: string; query?: Record<string, string>; length?: number } = {},
) => {
  const q = new URLSearchParams({ name: "Dron mayo", ...opts.query });
  return app.request(
    `/org/farms/${farmId}/custom-layers?${q}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": opts.type ?? "image/png",
        "content-length": String(opts.length ?? body.byteLength),
      },
      body,
    },
    env,
  );
};

describe("capas propias (M-17)", () => {
  it("guarda un PNG con 4 esquinas, lo lista, lo sirve y lo borra", async () => {
    const { owner, farmId } = await setup();
    const res = await upload(owner.token, farmId, PNG, { query: { corners: CORNERS } });
    expect(res.status).toBe(201);
    const { id, status } = (await res.json()) as { id: string; status: string };
    expect(status).toBe("ready");
    const list = await call<any[]>("GET", `/org/farms/${farmId}/custom-layers`, { token: owner.token });
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id, name: "Dron mayo", kind: "image", status: "ready" });
    expect(list.body[0].corners).toHaveLength(4);
    expect(list.body[0]).not.toHaveProperty("originalPath");
    const img = await app.request(`/org/custom-layers/${id}/image`, { headers: { authorization: `Bearer ${owner.token}` } }, env);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
    expect((await call("DELETE", `/org/custom-layers/${id}`, { token: owner.token })).status).toBe(200);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/custom-layers`, { token: owner.token })).body).toEqual([]);
    expect((await call("GET", `/org/custom-layers/${id}/image`, { token: owner.token })).status).toBe(404);
  });

  it("valida tipo, tamaño, esquinas y contenido real", async () => {
    const { owner, farmId } = await setup();
    expect((await upload(owner.token, farmId, PNG, { type: "application/pdf", query: { corners: CORNERS } })).status).toBe(415);
    expect((await upload(owner.token, farmId, PNG)).status).toBe(400); // sin esquinas
    expect((await upload(owner.token, farmId, PNG, { query: { corners: "[[0,0],[0,0],[0,0],[0,0]]" } })).status).toBe(400);
    expect((await upload(owner.token, farmId, PNG, { query: { corners: CORNERS, name: " " } })).status).toBe(400);
    expect((await upload(owner.token, farmId, PNG, { query: { corners: CORNERS }, length: 50_000_000 })).status).toBe(413);
    // dice ser PNG pero son bytes de un TIFF
    expect((await upload(owner.token, farmId, TIFF, { query: { corners: CORNERS } })).status).toBe(400);
    expect((await call<any[]>("GET", `/org/farms/${farmId}/custom-layers`, { token: owner.token })).body).toEqual([]);
  });

  it("un GeoTIFF queda en proceso hasta que el job entrega el PNG", async () => {
    const { owner, farmId } = await setup();
    const res = await upload(owner.token, farmId, TIFF, { type: "image/tiff" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const list = await call<any[]>("GET", `/org/farms/${farmId}/custom-layers`, { token: owner.token });
    expect(list.body[0]).toMatchObject({ kind: "geotiff", status: "processing", corners: null });
    expect((await call("GET", `/org/custom-layers/${id}/image`, { token: owner.token })).status).toBe(404);

    const pending = await signedIngest("GET", `/ingest/farms/${farmId}/custom-layers-pending`);
    expect(((await pending.json()) as any[]).map((p) => p.id)).toEqual([id]);
    // una ruta ajena a la capa se rechaza
    const bad = await signedIngest("POST", `/ingest/custom-layers/${id}/result`, {
      status: "ready", imagePath: "layers/otra/x/image.png", imageMime: "image/png", bytes: 10, corners: JSON.parse(CORNERS),
    });
    expect(bad.status).toBe(404);
    const orgId = owner.orgId;
    const ok = await signedIngest("POST", `/ingest/custom-layers/${id}/result`, {
      status: "ready", imagePath: `layers/${orgId}/${id}/image.png`, imageMime: "image/png", bytes: PNG.byteLength, corners: JSON.parse(CORNERS),
    });
    expect(ok.status).toBe(200);
    await env.MEDIA.put(`layers/${orgId}/${id}/image.png`, PNG);
    const after = await call<any[]>("GET", `/org/farms/${farmId}/custom-layers`, { token: owner.token });
    expect(after.body[0]).toMatchObject({ status: "ready" });
    expect(after.body[0].corners).toHaveLength(4);
    expect((await app.request(`/org/custom-layers/${id}/image`, { headers: { authorization: `Bearer ${owner.token}` } }, env)).status).toBe(200);
  });

  it("permisos: agrónomo sube; supervisor y empleado no; otra organización no ve nada", async () => {
    const { owner, farmId } = await setup();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const sup = await addMemberAndLogin(owner.token, "supervisor");
    const worker = await addMemberAndLogin(owner.token, "worker");
    const mine = await upload(agro.token, farmId, PNG, { query: { corners: CORNERS } });
    expect(mine.status).toBe(201);
    const id = ((await mine.json()) as { id: string }).id;
    expect((await upload(sup.token, farmId, PNG, { query: { corners: CORNERS } })).status).toBe(403);
    expect((await upload(worker.token, farmId, PNG, { query: { corners: CORNERS } })).status).toBe(403);
    expect((await call("DELETE", `/org/custom-layers/${id}`, { token: sup.token })).status).toBe(403);
    expect((await call("GET", `/org/farms/${farmId}/custom-layers`, { token: worker.token })).status).toBe(403);

    const other = await createOrgWithOwner("Otra");
    expect((await call("GET", `/org/farms/${farmId}/custom-layers`, { token: other.token })).status).toBe(404);
    expect((await call("GET", `/org/custom-layers/${id}/image`, { token: other.token })).status).toBe(404);
    expect((await call("DELETE", `/org/custom-layers/${id}`, { token: other.token })).status).toBe(404);
  });
});
