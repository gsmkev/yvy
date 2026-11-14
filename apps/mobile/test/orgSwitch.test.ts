import { describe, expect, it } from "vitest";
import { newId } from "@yvy/shared";
import { LocalDb, type NewRecord } from "../src/db/store";
import { HttpError } from "../src/lib/errors";
import { writeCache } from "../src/lib/httpCache";
import { orgOptions, switchOrganization } from "../src/lib/orgSwitch";
import type { Session } from "../src/lib/session";
import { nodeSql } from "./node-sql";

const A = { id: newId(), name: "Estancia A", role: "agronomist" };
const B = { id: newId(), name: "Estancia B", role: "agronomist" };
const session = (org: typeof A): Session => ({
  accessToken: "t",
  accessTokenExpiresAt: 1,
  refreshToken: "r",
  refreshTokenExpiresAt: 1,
  user: { id: newId(), fullName: "Ana", email: null },
  organization: org,
  organizations: [A, B],
});
const rec: NewRecord = { farmId: newId(), plotId: null, poiId: null, kind: "rain", data: { mm: 3, readAt: 1 }, lon: null, lat: null, gpsAccuracyM: null, capturedAt: Date.now() };

function setup() {
  const db = new LocalDb(nodeSql());
  db.migrate();
  const cur = session(A);
  let saved: Session | null = null;
  let asked = 0;
  return {
    db,
    cur,
    saved: () => saved,
    asked: () => asked,
    deps: (fail?: Error) => ({
      db,
      current: cur,
      requestSession: async (id: string) => {
        asked++;
        if (fail) throw fail;
        return { ...session(id === B.id ? B : A), user: cur.user };
      },
      setSession: async (s: Session) => void (saved = s),
    }),
  };
}

describe("selector de organización", () => {
  it("cambia: pide la sesión, borra lo de la organización anterior y la guarda", async () => {
    const x = setup();
    x.db.setKv("selected_farm_id", "f1");
    x.db.setKv("forecast:f1", "{}");
    x.db.setKv("member_names", "{}");
    x.db.setKv("device_id", "mi-celular");
    writeCache(x.db, { userId: x.cur.user.id, orgId: A.id }, "/org/members", [], 1);
    const r = await switchOrganization(x.deps(), B.id);
    expect(r.ok).toBe(true);
    expect(x.saved()?.organization.id).toBe(B.id);
    expect(x.db.getKv("selected_farm_id")).toBeNull();
    expect(x.db.getKv("forecast:f1")).toBeNull();
    expect(x.db.getKv("member_names")).toBeNull();
    expect(x.db.getKv("device_id")).toBe("mi-celular");
    expect(x.db.sql.all("SELECT key FROM kv WHERE key LIKE 'http:%'")).toHaveLength(0);
  });

  it("con algo sin mandar se bloquea y no pide nada al servidor", async () => {
    const x = setup();
    x.db.saveRecord(x.cur.user.id, A.id, rec);
    const r = await switchOrganization(x.deps(), B.id);
    expect(r).toEqual({ ok: false, reason: "pending", n: 1 });
    expect(x.asked()).toBe(0);
    expect(x.saved()).toBeNull();
  });

  it("si el servidor la niega o no hay señal, no se borra nada", async () => {
    const x = setup();
    x.db.setKv("selected_farm_id", "f1");
    await expect(switchOrganization(x.deps(new HttpError(403, "No pertenecés a esa organización")), B.id)).rejects.toThrow("No pertenecés");
    expect(x.db.getKv("selected_farm_id")).toBe("f1");
    expect(x.saved()).toBeNull();
  });

  it("elegir la misma organización no hace nada", async () => {
    const x = setup();
    expect(await switchOrganization(x.deps(), A.id)).toEqual({ ok: false, reason: "same" });
    expect(x.asked()).toBe(0);
  });

  it("solo hay selector con más de una organización", () => {
    expect(orgOptions(session(A))).toHaveLength(2);
    expect(orgOptions({ ...session(A), organizations: [A] })).toEqual([]);
    expect(orgOptions({ ...session(A), organizations: undefined })).toEqual([]);
    expect(orgOptions(null)).toEqual([]);
  });
});
