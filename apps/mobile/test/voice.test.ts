import { describe, expect, it } from "vitest";
import { attachmentRow, LIMITS, newId } from "@yvy/shared";
import { LocalDb, type NewRecord } from "../src/db/store";
import { nodeSql } from "./node-sql";

const ORG = newId();
const USER = newId();
const FARM = newId();

const rec: NewRecord = { farmId: FARM, plotId: null, poiId: null, kind: "rain", data: { mm: 10, readAt: 1 }, lon: null, lat: null, gpsAccuracyM: null, capturedAt: Date.now() };
const photo = { photoUri: "file:///p.webp", thumbUri: "file:///t.webp", width: 1280, height: 960, bytes: 120_000 };
const voice = { uri: "file:///voz.m4a", bytes: 90_000 };

function setup() {
  const db = new LocalDb(nodeSql());
  db.migrate();
  return db;
}

describe("nota de voz (F-09)", () => {
  it("se guarda como adjunto audio/mp4 sin miniatura y con su mutación válida en el outbox", async () => {
    const db = setup();
    const id = db.saveRecord(USER, ORG, rec, [], undefined, voice);
    const muts = await db.pendingMutations(10);
    const att = muts.find((m) => m.kind === "attachments.upsert");
    expect(att).toBeTruthy();
    if (att?.kind !== "attachments.upsert") throw new Error("sin adjunto");
    expect(att.row).toMatchObject({ recordId: id, mime: "audio/mp4", width: null, height: null, bytes: 90_000 });
    expect(attachmentRow.safeParse(att.row).success).toBe(true);
    expect(db.voiceOfRecord(id)).toEqual([{ id: att.row.id, uri: voice.uri, uploaded: false }]);
  });

  it("no cuenta como foto ni da miniatura", () => {
    const db = setup();
    const id = db.saveRecord(USER, ORG, rec, [photo], undefined, voice);
    const row = db.records().find((r) => r.id === id)!;
    expect(row.photos).toBe(1);
    expect(row.voice).toBe(1);
    expect(db.photosOfRecord(id)).toHaveLength(1);
    expect(db.firstThumbByRecord().get(id)).toBe(photo.thumbUri);
  });

  it("sube por el mismo camino que las fotos y avisa su tipo", () => {
    const db = setup();
    db.saveRecord(USER, ORG, rec, [], undefined, voice);
    // Mientras la mutación del adjunto siga en el outbox no hay nada que subir.
    expect(db.pendingUploads()).toHaveLength(0);
    db.sql.run("DELETE FROM outbox");
    expect(db.pendingUploads()).toMatchObject([{ photoUri: voice.uri, thumbUri: "", mime: "audio/mp4" }]);
  });

  it("rechaza una nota que pasa el tope de peso", () => {
    const db = setup();
    expect(() => db.saveRecord(USER, ORG, rec, [], undefined, { uri: "file:///x.m4a", bytes: LIMITS.audio.maxBytes + 1 })).toThrow("audio_too_big");
  });

  it("el protocolo rechaza un audio con peso de foto grande y un mime desconocido", () => {
    const base = { id: newId(), recordId: newId(), width: null, height: null };
    expect(attachmentRow.safeParse({ ...base, mime: "audio/mp4", bytes: LIMITS.audio.maxBytes + 1 }).success).toBe(false);
    expect(attachmentRow.safeParse({ ...base, mime: "audio/mp4", bytes: LIMITS.photos.maxBytes + 10 }).success).toBe(true);
    expect(attachmentRow.safeParse({ ...base, mime: "image/webp", bytes: LIMITS.photos.maxBytes + 10 }).success).toBe(false);
    expect(attachmentRow.safeParse({ ...base, mime: "video/mp4", bytes: 10 }).success).toBe(false);
  });
});
