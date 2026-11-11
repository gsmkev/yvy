import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { LocalDb, type NewRecord } from "../src/db/store";
import { nodeSql } from "./node-sql";

const ORG = newId();
const USER = newId();
const rec: NewRecord = { farmId: newId(), plotId: null, poiId: null, kind: "rain", data: { mm: 3, readAt: 1 }, lon: null, lat: null, gpsAccuracyM: null, capturedAt: Date.now() };
const photo = (n: number) => ({ photoUri: `file:///p${n}.webp`, thumbUri: `file:///p${n}_t.webp`, width: 1280, height: 960, bytes: 100_000 + n });

function setup() {
  const db = new LocalDb(nodeSql());
  db.migrate();
  return db;
}

/** Simula que el motor de sync mandó todo: sin mutaciones pendientes y con el servidor confirmando la subida. */
function sent(db: LocalDb, attachmentIds: string[]) {
  db.sql.run("DELETE FROM outbox");
  for (const id of attachmentIds) {
    db.sql.run("UPDATE attachments SET upload_status = 'uploaded' WHERE id = ?", [id]);
    db.markUploaded(id, true);
  }
}
const attachmentIds = (db: LocalDb) => db.sql.all<{ id: string }>("SELECT id FROM attachments ORDER BY created_at, rowid").map((r) => r.id);

describe("almacenamiento (F-19)", () => {
  it("suma fotos, notas de voz y mapas", () => {
    const db = setup();
    db.saveRecord(USER, ORG, rec, [photo(1), photo(2)], undefined, { uri: "file:///v.m4a", bytes: 50_000 });
    db.sql.run("INSERT INTO offline_packs (layer_id, farm_id, layer, uri, bytes, downloaded_at) VALUES ('l1', 'f', 'ndvi', 'file:///m.pmtiles', 7000000, 1)");
    const s = db.storageSummary();
    expect(s.photos).toEqual({ n: 2, bytes: 200_003 });
    expect(s.voice).toEqual({ n: 1, bytes: 50_000 });
    expect(s.maps).toEqual({ n: 1, bytes: 7_000_000 });
    expect(s.reclaimable).toEqual({ n: 0, bytes: 0 });
  });

  it("solo se pueden borrar los archivos ya subidos; lo pendiente no se toca", () => {
    const db = setup();
    db.saveRecord(USER, ORG, rec, [photo(1), photo(2)]);
    const [a, b] = attachmentIds(db);
    // Todo en el outbox: nada que borrar.
    expect(db.uploadedFiles()).toEqual([]);
    sent(db, [a!]);
    // La foto b sigue sin subir (aunque su mutación ya salió).
    expect(db.uploadedFiles()).toEqual([{ attachmentId: a, uri: "file:///p1.webp", bytes: 100_001 }]);
    expect(db.pendingUploads().map((p) => p.attachmentId)).toEqual([b]);
  });

  it("después de borrar, la miniatura sigue y la foto deja de contarse", () => {
    const db = setup();
    const id = db.saveRecord(USER, ORG, rec, [photo(1)], undefined, { uri: "file:///v.m4a", bytes: 40_000 });
    sent(db, attachmentIds(db));
    expect(db.storageSummary().reclaimable).toEqual({ n: 2, bytes: 140_001 });
    db.clearUploadedFiles(db.uploadedFiles().map((f) => f.attachmentId));
    expect(db.storageSummary()).toMatchObject({ photos: { n: 0, bytes: 0 }, voice: { n: 0, bytes: 0 }, reclaimable: { n: 0, bytes: 0 } });
    expect(db.firstThumbByRecord().get(id)).toBe("file:///p1_t.webp");
    // La nota de voz ya no tiene archivo local: se escucha desde el servidor.
    expect(db.voiceOfRecord(id)[0]).toMatchObject({ uri: null, uploaded: true });
    // Y no vuelve a la cola de subida.
    expect(db.pendingUploads()).toEqual([]);
    expect(db.uploadedFiles()).toEqual([]);
  });
});
