import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ALERT_KINDS, DEFAULT_NOTIFICATION_PREFS, inQuietHours, parseNotificationPrefs } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { upsertAlert } from "../src/jobs/alerts";
import { sendPending } from "../src/jobs/notify";
import type { AlertDraft } from "../src/jobs/rules";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db } from "./helpers";

const draft = (kind: AlertDraft["kind"], validFrom: string): AlertDraft => ({
  kind,
  severity: "warning",
  probability: "high",
  validFrom,
  validTo: validFrom,
  summary: "x",
  details: {},
});
const prefs = (over: Record<string, unknown>) => ({ ...DEFAULT_NOTIFICATION_PREFS, ...over });

describe("preferencias de notificación (U-29)", () => {
  it("GET devuelve los valores por defecto y qué le llega a cada rol", async () => {
    const owner = await createOrgWithOwner();
    const worker = await addMemberAndLogin(owner.token, "worker");
    const o = await call<any>("GET", "/me/notification-prefs", { token: owner.token });
    expect(o.status).toBe(200);
    expect(o.body.prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(o.body.email).toBe(true);
    expect(o.body.kinds).toHaveLength(ALERT_KINDS.length);
    const w = await call<any>("GET", "/me/notification-prefs", { token: worker.token });
    expect(w.body.kinds).toEqual(["frost", "fire"]);
    expect(w.body.email).toBe(false);
    expect((await call("GET", "/me/notification-prefs")).status).toBe(401);
  });

  it("PUT guarda por usuario, valida y no toca a los demás", async () => {
    const owner = await createOrgWithOwner();
    const admin = await addMemberAndLogin(owner.token, "admin");
    const mine = prefs({
      kinds: { ...DEFAULT_NOTIFICATION_PREFS.kinds, excess_rain: { push: false, email: false } },
      quiet: { enabled: true, start: "22:00", end: "05:30" },
    });
    expect((await call("PUT", "/me/notification-prefs", { token: owner.token, body: mine })).status).toBe(200);
    expect((await call<any>("GET", "/me/notification-prefs", { token: owner.token })).body.prefs).toEqual(mine);
    expect((await call<any>("GET", "/me/notification-prefs", { token: admin.token })).body.prefs).toEqual(
      DEFAULT_NOTIFICATION_PREFS,
    );
    const bad = (quiet: unknown) => call("PUT", "/me/notification-prefs", { token: owner.token, body: prefs({ quiet }) });
    expect((await bad({ enabled: true, start: "25:00", end: "05:00" })).status).toBe(400);
    expect((await bad({ enabled: true, start: "07:00", end: "07:00" })).status).toBe(400);
    expect((await call("PUT", "/me/notification-prefs", { token: owner.token, body: { kinds: {} } })).status).toBe(400);
  });

  it("no se crean las notificaciones que el usuario apagó", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const admin = await addMemberAndLogin(owner.token, "admin");
    await call("PUT", "/me/notification-prefs", {
      token: admin.token,
      body: prefs({
        kinds: {
          ...DEFAULT_NOTIFICATION_PREFS.kinds,
          frost: { push: true, email: false },
          excess_rain: { push: false, email: false },
        },
      }),
    });
    const farm = { id: farmId, organizationId: owner.orgId };
    await upsertAlert(db(), farm, draft("frost", "2026-11-12"));
    await upsertAlert(db(), farm, draft("excess_rain", "2026-11-12"));
    const rows = await db().select().from(s.notifications);
    const of = (id: string) => rows.filter((n) => n.userId === id).map((n) => n.channel).sort();
    expect(of(admin.userId)).toEqual(["push"]); // helada solo push; lluvia nada
    expect(of(owner.userId)).toEqual(["email", "email", "push", "push"]);
  });

  it("horario de silencio: el push espera y sale cuando termina; el email no se frena", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await call("POST", "/devices", {
      token: owner.token,
      body: { id: "cel", platform: "android", pushToken: "ExponentPushToken[abc]" },
    });
    await call("PUT", "/me/notification-prefs", {
      token: owner.token,
      body: prefs({ quiet: { enabled: true, start: "21:00", end: "06:00" } }),
    });
    await upsertAlert(db(), { id: farmId, organizationId: owner.orgId }, draft("frost", "2026-11-12"));
    const sent: string[] = [];
    const fake = (async (url: string | URL | Request) => {
      sent.push(String(url));
      return Response.json({ data: [] });
    }) as typeof fetch;
    // 23:00 en Asunción (UTC-3) = 02:00 UTC
    const night = Date.parse("2026-11-12T02:00:00Z");
    const mine = async () =>
      (await db().select().from(s.notifications)).filter((n) => n.userId === owner.userId);
    await sendPending(db(), { ...env, RESEND_API_KEY: "" } as never, fake, night);
    expect(sent.filter((u) => u.includes("exp.host"))).toHaveLength(0);
    expect((await mine()).map((n) => `${n.channel}:${n.status}`).sort()).toEqual(["email:sent", "push:pending"]);
    // 08:00 en Asunción = 11:00 UTC
    const morning = Date.parse("2026-11-12T11:00:00Z");
    await sendPending(db(), { ...env, RESEND_API_KEY: "" } as never, fake, morning);
    expect(sent.filter((u) => u.includes("exp.host"))).toHaveLength(1);
    expect((await mine()).map((n) => `${n.channel}:${n.status}`).sort()).toEqual(["email:sent", "push:sent"]);
  });

  it("inQuietHours: ventanas normales y que cruzan la medianoche", () => {
    const q = (start: string, end: string) => ({ enabled: true, start, end });
    expect(inQuietHours(q("21:00", "06:00"), "23:30")).toBe(true);
    expect(inQuietHours(q("21:00", "06:00"), "05:59")).toBe(true);
    expect(inQuietHours(q("21:00", "06:00"), "06:00")).toBe(false);
    expect(inQuietHours(q("13:00", "15:00"), "14:00")).toBe(true);
    expect(inQuietHours(q("13:00", "15:00"), "16:00")).toBe(false);
    expect(inQuietHours({ ...q("21:00", "06:00"), enabled: false }, "23:00")).toBe(false);
  });

  it("parseNotificationPrefs completa lo que falta y tolera JSON dañado", () => {
    expect(parseNotificationPrefs("no es json")).toEqual(DEFAULT_NOTIFICATION_PREFS);
    const p = parseNotificationPrefs(JSON.stringify({ kinds: { fire: { push: false } } }));
    expect(p.kinds.fire).toEqual({ push: false, email: true });
    expect(p.kinds.frost).toEqual({ push: true, email: true });
  });
});
