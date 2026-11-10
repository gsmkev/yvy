/** REVISION.md: B1, B7, B8, B9, geometría, reloj del celular y rate limit por IP. */
import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { LIMITS, newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { sendEmail } from "../src/lib/email";
import { upsertAlert } from "../src/jobs/alerts";
import { sendPending } from "../src/jobs/notify";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, pullAll, square } from "./helpers";

async function setup() {
  const owner = await createOrgWithOwner();
  const { farmId, plotIds } = await createFarmWithPlots(owner.token, 3);
  const worker = await addMemberAndLogin(owner.token, "worker");
  await call("PUT", `/org/members/${worker.userId}/plots`, { token: owner.token, body: { plotIds } });
  return { owner, worker, farmId, plotIds };
}

const mkTask = (token: string, farmId: string, plotId: string | null, assigneeId: string) =>
  call<{ id: string }>("POST", "/org/tasks", {
    token,
    body: { farmId, plotId, assigneeId, title: "Recorrer", dueDate: "2026-12-01" },
  });

const assignmentsVersion = async (userId: string) =>
  (await db().select().from(s.memberships).where(eq(s.memberships.userId, userId)))[0]!.assignmentsVersion;

describe("B1 borrado en cascada", () => {
  it("borrar un lote da de baja asignaciones, cancela tareas y sube assignments_version", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const t1 = await mkTask(owner.token, farmId, plotIds[0]!, worker.userId);
    const t2 = await mkTask(owner.token, farmId, plotIds[1]!, worker.userId);
    const before = await assignmentsVersion(worker.userId);

    expect((await call("DELETE", `/org/plots/${plotIds[0]}`, { token: owner.token })).status).toBe(200);

    const asg = await pullAll(worker.token, "plot_assignments");
    expect(asg.filter((a) => !a.deletedAt)).toHaveLength(2);
    expect(asg.find((a) => a.plotId === plotIds[0])?.deletedAt).toBeTruthy();
    const tasks = await pullAll(worker.token, "tasks");
    expect(tasks.find((t) => t.id === t1.body.id)?.status).toBe("cancelled");
    expect(tasks.find((t) => t.id === t2.body.id)?.status).toBe("open");
    expect(await assignmentsVersion(worker.userId)).toBe(before + 1);
  });

  it("borrar una estancia limpia todo", async () => {
    const { owner, worker, farmId, plotIds } = await setup();
    const t1 = await mkTask(owner.token, farmId, null, worker.userId);
    const before = await assignmentsVersion(worker.userId);
    expect((await call("DELETE", `/org/farms/${farmId}`, { token: owner.token })).status).toBe(200);
    const asg = await pullAll(worker.token, "plot_assignments");
    expect(asg.filter((a) => !a.deletedAt)).toHaveLength(0);
    expect(asg).toHaveLength(plotIds.length);
    expect((await pullAll(worker.token, "tasks")).find((t) => t.id === t1.body.id)?.status).toBe("cancelled");
    expect(await assignmentsVersion(worker.userId)).toBe(before + 1);
  });
});

describe("geometría", () => {
  const farmBody = (geometry: unknown) => ({ name: "F", geometry });
  it("quita Z y guarda en 2D", async () => {
    const owner = await createOrgWithOwner();
    const g = square(-55.9, -27.2, 0.05);
    const g3d = { ...g, coordinates: g.coordinates.map((r) => r.map((p) => [...p, 123])) };
    const r = await call<{ id: string }>("POST", "/org/farms", { token: owner.token, body: farmBody(g3d) });
    expect(r.status).toBe(201);
    const [row] = await db().select().from(s.farms).where(eq(s.farms.id, r.body.id));
    expect(JSON.parse(row!.geometry).coordinates[0][0]).toHaveLength(2);
  });

  it("rechaza lotes menores a 0,1 ha y estancias mayores a 100.000 ha", async () => {
    const { owner, farmId } = await setup();
    const tiny = await call("POST", `/org/farms/${farmId}/plots`, {
      token: owner.token,
      body: { plots: [{ name: "Chico", kind: "crop", geometry: square(-55.5, -27.5, 0.0001) }] },
    });
    expect(tiny.status).toBe(400);
    expect(JSON.stringify(tiny.body)).toContain("demasiado chico");
    const huge = await call("POST", "/org/farms", { token: owner.token, body: farmBody(square(-58, -22, 3)) });
    expect(huge.status).toBe(400);
    expect(JSON.stringify(huge.body)).toContain("demasiado grande");
  });

  it("tope de vértices en la edición", async () => {
    const { owner, plotIds } = await setup();
    const n = LIMITS.geometry.maxVertices + 10;
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI;
      return [-55 + 0.01 * Math.cos(a), -27 + 0.01 * Math.sin(a)];
    });
    ring.push(ring[0]!);
    const r = await call("PATCH", `/org/plots/${plotIds[0]}`, {
      token: owner.token,
      body: { geometry: { type: "Polygon", coordinates: [ring] } },
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("vértices");
  });
});

describe("reloj del celular", () => {
  it("rechaza capturedAt a más de 1 h en el futuro", async () => {
    const { worker, farmId } = await setup();
    const rec = (capturedAt: number) => ({
      mutationId: newId(),
      kind: "records.upsert",
      row: {
        id: newId(),
        farmId,
        plotId: null,
        poiId: null,
        kind: "note",
        data: { text: "hola" },
        schemaVersion: RECORD_SCHEMA_VERSION,
        lon: null,
        lat: null,
        gpsAccuracyM: null,
        capturedAt,
      },
    });
    const r = await call("POST", "/sync/push", {
      token: worker.token,
      body: { deviceId: "d", mutations: [rec(Date.now() + 2 * 3_600_000), rec(Date.now() + 60_000)] },
    });
    expect(r.body.results.map((x: any) => x.status)).toEqual(["rejected", "applied"]);
    expect(r.body.results[0].reason).toBe("captured_in_future");
  });
});

describe("B7 tareas en el pull", () => {
  it("solo abiertas o cerradas en los últimos 30 días", async () => {
    const { owner, worker, farmId } = await setup();
    const open = await mkTask(owner.token, farmId, null, worker.userId);
    const recent = await mkTask(owner.token, farmId, null, worker.userId);
    const old = await mkTask(owner.token, farmId, null, worker.userId);
    const now = Date.now();
    const done = (id: string, at: number) =>
      db().update(s.tasks).set({ status: "done", completedAt: at, updatedAt: at }).where(eq(s.tasks.id, id));
    await done(recent.body.id, now - 5 * 86_400_000);
    await done(old.body.id, now - 60 * 86_400_000);
    const ids = (await pullAll(worker.token, "tasks")).map((t) => t.id);
    expect(ids).toContain(open.body.id);
    expect(ids).toContain(recent.body.id);
    expect(ids).not.toContain(old.body.id);
  });
});

describe("B8 avisos con ventana solapada", () => {
  const draft = (from: string, to: string) => ({
    kind: "frost" as const,
    severity: "warning" as const,
    probability: "medium" as const,
    validFrom: from,
    validTo: to,
    summary: "Helada",
    details: {},
  });
  it("actualiza el aviso activo en vez de crear otro", async () => {
    const { farmId } = await setup();
    const [farm] = await db().select().from(s.farms).where(eq(s.farms.id, farmId));
    const a = await upsertAlert(db(), farm!, draft("2026-07-02", "2026-07-03"));
    const b = await upsertAlert(db(), farm!, draft("2026-07-03", "2026-07-04"));
    expect(b!.id).toBe(a!.id);
    const c = await upsertAlert(db(), farm!, draft("2026-07-20", "2026-07-21")); // sin solape
    expect(c!.id).not.toBe(a!.id);
    expect(await db().select().from(s.alerts).where(eq(s.alerts.farmId, farmId))).toHaveLength(2);
  });
});

describe("B9 tokens de push inválidos", () => {
  it("DeviceNotRegistered borra el token", async () => {
    const { owner, farmId } = await setup();
    const [farm] = await db().select().from(s.farms).where(eq(s.farms.id, farmId));
    await db()
      .insert(s.devices)
      .values({ id: "dv1", userId: owner.userId, platform: "android", pushToken: "ExpoPushToken[dead]" });
    await upsertAlert(db(), farm!, {
      kind: "frost",
      severity: "warning",
      probability: "high",
      validFrom: "2026-07-02",
      validTo: "2026-07-03",
      summary: "Helada",
      details: {},
    });
    const fakeFetch = (async () =>
      Response.json({
        data: [{ status: "error", message: "x", details: { error: "DeviceNotRegistered" } }],
      })) as unknown as typeof fetch;
    await sendPending(db(), env, fakeFetch);
    const [d] = await db()
      .select()
      .from(s.devices)
      .where(and(eq(s.devices.id, "dv1")));
    expect(d!.pushToken).toBeNull();
  });
});

describe("auth: límite por IP y código en producción", () => {
  it("máximo de códigos por IP por hora", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const headers = { "CF-Connecting-IP": "203.0.113.9" };
    let last = 200;
    for (let i = 0; i < LIMITS.auth.emailCodesPerIp + 1; i++) {
      const email = `ip${i}@estancia.py`;
      await call("POST", "/auth/signup", { body: { organizationName: `Org ${i}`, fullName: "Ana", email } });
      last = (await call("POST", "/auth/email/start", { body: { email }, headers })).status;
    }
    expect(last).toBe(429);
    const ok = await call("POST", "/auth/email/start", {
      body: { email: "ip0@estancia.py" },
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    });
    expect(ok.status).toBe(200);
    log.mockRestore();
  });

  it("en producción sin RESEND_API_KEY no imprime el código", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const prod = { ...env, APP_ENV: "production", RESEND_API_KEY: undefined } as unknown as typeof env;
    await sendEmail(prod, "a@b.py", "Código 123456", "Tu código es 123456");
    expect(log).not.toHaveBeenCalled();
    await sendEmail({ ...prod, APP_ENV: "development" } as never, "a@b.py", "x", "Tu código es 123456");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
