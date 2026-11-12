/** Nota de voz (F-09): adjunto audio/mp4 sin miniatura; no le quita lugar a las fotos y se limita a una por registro. */
import { describe, expect, it } from "vitest";
import { LIMITS, newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { call, createFarmWithPlots, createOrgWithOwner, pullAll } from "./helpers";

const push = (token: string, mutations: unknown[]) => call("POST", "/sync/push", { token, body: { deviceId: "dev", mutations } });

const rain = (farmId: string, id = newId()) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id,
    farmId,
    plotId: null,
    poiId: null,
    kind: "rain",
    data: { mm: 12, readAt: Date.now() },
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: null,
    lat: null,
    gpsAccuracyM: null,
    capturedAt: Date.now(),
  },
});

const photo = (recordId: string) => ({
  mutationId: newId(),
  kind: "attachments.upsert",
  row: { id: newId(), recordId, mime: "image/webp", width: 1280, height: 960, bytes: 100_000 },
});
const voice = (recordId: string, bytes = 90_000) => ({
  mutationId: newId(),
  kind: "attachments.upsert",
  row: { id: newId(), recordId, mime: LIMITS.audio.mime, width: null, height: null, bytes },
});

describe("nota de voz", () => {
  it("se guarda sin miniatura, con ruta .m4a, y vuelve en el pull", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const r = rain(farmId);
    const v = voice(r.row.id);
    const res = await push(owner.token, [r, v]);
    expect(res.body.results.map((x: any) => x.status)).toEqual(["applied", "applied"]);
    const rows = await pullAll(owner.token, "attachments");
    const att = rows.find((a: any) => a.id === v.row.id);
    expect(att.mime).toBe("audio/mp4");
    expect(att.storagePath).toMatch(/\.m4a$/);
    expect(att.thumbPath).toBe("");
    expect(att.uploadStatus).toBe("pending");
  });

  it("convive con 3 fotos, pero no admite una segunda nota", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const r = rain(farmId);
    const res = await push(owner.token, [r, photo(r.row.id), photo(r.row.id), photo(r.row.id), voice(r.row.id), voice(r.row.id)]);
    expect(res.body.results.map((x: any) => x.status)).toEqual(["applied", "applied", "applied", "applied", "applied", "rejected"]);
    expect(res.body.results[5].reason).toBe("too_many_attachments");
    // El límite también vale entre pushes: el recuento sale de la base.
    const again = await push(owner.token, [voice(r.row.id), photo(r.row.id)]);
    expect(again.body.results.map((x: any) => x.reason ?? x.status)).toEqual(["too_many_attachments", "too_many_attachments"]);
  });

  it("rechaza una nota demasiado pesada o un tipo desconocido", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const r = rain(farmId);
    await push(owner.token, [r]);
    const big = await push(owner.token, [voice(r.row.id, LIMITS.audio.maxBytes + 1)]);
    expect(big.status).toBe(400);
    const odd = { ...voice(r.row.id), row: { ...voice(r.row.id).row, mime: "video/mp4" } };
    expect((await push(owner.token, [odd])).status).toBe(400);
  });
});
