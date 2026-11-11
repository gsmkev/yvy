import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { LocalDb, type NewRecord } from "../src/db/store";
import { canSwitchUser, unsentSummary } from "../src/lib/switchUser";
import { nodeSql } from "./node-sql";

const ORG = newId();
const rec: NewRecord = { farmId: newId(), plotId: null, poiId: null, kind: "rain", data: { mm: 3, readAt: 1 }, lon: null, lat: null, gpsAccuracyM: null, capturedAt: Date.now() };
const photo = { photoUri: "file:///p.webp", thumbUri: "file:///t.webp", width: 1280, height: 960, bytes: 100_000 };

function setup() {
  const db = new LocalDb(nodeSql());
  db.migrate();
  return db;
}

describe("cambiar de usuario en un celular compartido (F-25)", () => {
  it("con todo mandado se puede cambiar", () => {
    const db = setup();
    expect(canSwitchUser(unsentSummary(db))).toEqual({ blocked: false });
  });

  it("con algo en la cola de envío, se bloquea y dice cuántos", () => {
    const db = setup();
    db.saveRecord(newId(), ORG, rec);
    db.saveRecord(newId(), ORG, rec);
    expect(canSwitchUser(unsentSummary(db))).toEqual({ blocked: true, reason: "pending", n: 2 });
  });

  it("también cuenta las fotos que faltan subir aunque el registro ya llegó", () => {
    const db = setup();
    db.saveRecord(newId(), ORG, rec, [photo]);
    db.sql.run("DELETE FROM outbox"); // el servidor ya recibió las mutaciones; falta subir el archivo
    const u = unsentSummary(db);
    expect(u).toEqual({ mutations: 0, uploads: 1, rejected: 0 });
    expect(canSwitchUser(u)).toEqual({ blocked: true, reason: "pending", n: 1 });
  });

  it("lo rechazado por el servidor sigue siendo de quien lo anotó: hay que revisarlo antes", () => {
    const db = setup();
    db.saveRecord(newId(), ORG, rec);
    db.sql.run("UPDATE outbox SET rejected_reason = 'forbidden'");
    expect(canSwitchUser(unsentSummary(db))).toEqual({ blocked: true, reason: "rejected", n: 1 });
  });
});
