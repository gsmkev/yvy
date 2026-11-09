/**
 * Fase 2 · aceptación (sin dispositivo): el almacén del celular carga 15 registros sin señal y, al volver
 * la señal, quedan exactamente 15 en el servidor aunque el envío se corte y se reintente.
 * Corre contra `wrangler dev` cuando YVY_E2E_API y E2E_DEV_LOG están definidos.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { httpTransport, SyncEngine, type Transport } from "@yvy/sync";
import { LocalDb } from "../src/db/store";
import { nodeSql } from "./node-sql";

const API = process.env.YVY_E2E_API;
const LOG = process.env.E2E_DEV_LOG;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(data)}`);
  return data as T;
}

describe.runIf(API && LOG)("celular ↔ Worker real", () => {
  it("15 registros offline llegan una sola vez", async () => {
    const email = `cel-${Date.now()}@yvy.test`;
    await call("POST", "/auth/signup", { organizationName: "Agro Celu", fullName: "Dueña", email });
    await call("POST", "/auth/email/start", { email });
    const code = [...readFileSync(LOG!, "utf8").matchAll(/código es (\d{6})/g)].at(-1)![1];
    const owner = await call<{ accessToken: string }>("POST", "/auth/email/verify", { email, code });
    const sq = (lon: number, lat: number, d: number) => ({
      type: "Polygon",
      coordinates: [
        [
          [lon, lat],
          [lon + d, lat],
          [lon + d, lat - d],
          [lon, lat - d],
          [lon, lat],
        ],
      ],
    });
    const farm = await call<{ id: string }>(
      "POST",
      "/org/farms",
      { name: "Celu", geometry: sq(-55.95, -27.15, 0.06) },
      owner.accessToken,
    );
    const plots = await call<{ ids: string[] }>(
      "POST",
      `/org/farms/${farm.id}/plots`,
      { plots: [{ name: "Lote 1", kind: "crop", geometry: sq(-55.95, -27.15, 0.02) }] },
      owner.accessToken,
    );
    const worker = await call<{ userId: string }>(
      "POST",
      "/org/members",
      { fullName: "Ramón", role: "worker" },
      owner.accessToken,
    );
    await call("PUT", `/org/members/${worker.userId}/plots`, { plotIds: plots.ids }, owner.accessToken);
    const link = await call<{ code: string }>("POST", "/auth/link", { userId: worker.userId }, owner.accessToken);
    const ws = await call<{ accessToken: string; user: { id: string }; organization: { id: string } }>(
      "POST",
      "/auth/link/redeem",
      { code: link.code, deviceId: "moto-e" },
    );

    const db = new LocalDb(nodeSql());
    db.migrate();
    const real = httpTransport({ baseUrl: API!, getAccessToken: async () => ws.accessToken });
    let failNext = 0;
    const flaky: Transport = {
      ...real,
      push: async (d, ms) => {
        const res = await real.push(d, ms);
        if (failNext-- > 0) throw new TypeError("Network request failed"); // aplicó pero la respuesta se perdió
        return res;
      },
    };
    const engine = new SyncEngine({ store: db, transport: flaky, deviceId: "moto-e" });

    // Primera sincronización con señal: baja la estancia y el lote asignado.
    await engine.sync();
    expect(db.plots().map((p) => p.name)).toEqual(["Lote 1"]);

    // Modo avión: 15 registros.
    for (let i = 0; i < 15; i++) {
      db.saveRecord(ws.user.id, ws.organization.id, {
        farmId: farm.id,
        plotId: plots.ids[0]!,
        poiId: null,
        kind: "rain",
        data: { mm: i, readAt: Date.now() },
        lon: -55.94,
        lat: -27.16,
        gpsAccuracyM: 6,
        capturedAt: Date.now() - i * 60_000,
      });
    }
    expect(db.records().every((r) => r.pending)).toBe(true);

    // Vuelve la señal pero la respuesta del primer envío se pierde; después se reintenta.
    failNext = 1;
    await expect(engine.sync()).rejects.toThrow();
    await engine.sync();
    await engine.sync();
    expect(db.pendingCount()).toBe(0);
    expect(db.records().every((r) => !r.pending)).toBe(true);

    const server = await call<{ rows: unknown[] }>(
      "GET",
      `/org/records?farmId=${farm.id}&limit=100`,
      undefined,
      owner.accessToken,
    );
    expect(server.rows).toHaveLength(15);
  });
});
