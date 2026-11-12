import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as s from "@yvy/shared/schema";
import { buildCalendar, foldLine, icsText } from "../src/lib/ical";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner, db, square } from "./helpers";

const tokenOf = (url: string) => /\/public\/calendar\/(.+)\.ics$/.exec(url)![1]!;
const getIcs = (token: string) => call<any>("GET", `/public/calendar/${token}.ics`);
const rawIcs = async (token: string) => {
  const { app } = await import("../src/app");
  const { env } = await import("cloudflare:test");
  return app.request(`/public/calendar/${token}.ics`, {}, env);
};
const task = (token: string, body: Record<string, unknown>) =>
  call<{ id: string }>("POST", "/org/tasks", { token, body: { dueDate: "2030-03-01", ...body } });
const feedUrl = async (token: string) => (await call<{ url: string }>("POST", "/me/calendar-feed", { token })).body.url;

describe("iCalendar (RFC 5545)", () => {
  it("escapa texto y dobla líneas a 75 octetos sin partir caracteres", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = foldLine(`SUMMARY:${"ñ".repeat(80)}`);
    for (const part of long.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(long.split("\r\n ").join("")).toBe(`SUMMARY:${"ñ".repeat(80)}`);
  });

  it("evento de todo el día y evento con hora en la zona de la estancia", () => {
    const ics = buildCalendar("Prueba", [
      { uid: "a@yvy", stamp: Date.UTC(2030, 0, 1), date: "2030-12-31", time: null, tz: "America/Asuncion", summary: "Día" },
      { uid: "b@yvy", stamp: Date.UTC(2030, 0, 1), date: "2030-03-01", time: "08:30", tz: "America/Asuncion", summary: "Hora", geo: { lat: -25.3, lon: -57.6 }, priority: 1 },
    ]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20301231\r\nDTEND;VALUE=DATE:20310101");
    expect(ics).toContain("DTSTART;TZID=America/Asuncion:20300301T083000\r\nDTEND;TZID=America/Asuncion:20300301T093000");
    expect(ics).toContain("DTSTAMP:20300101T000000Z");
    expect(ics).toContain("GEO:-25.300000;-57.600000");
    expect(ics).toContain("PRIORITY:1");
  });
});

describe("enlace del calendario (I-04)", () => {
  it("el token sale una sola vez, en la base queda el hash, y regenerar revoca el anterior", async () => {
    const owner = await createOrgWithOwner();
    expect((await call<any>("GET", "/me/calendar-feed", { token: owner.token })).body.active).toBe(false);
    const url = await feedUrl(owner.token);
    expect(url).toMatch(/\/public\/calendar\/[A-Za-z0-9_-]{20,}\.ics$/);
    const t1 = tokenOf(url);
    const rows = await db().select().from(s.calendarFeeds).where(eq(s.calendarFeeds.userId, owner.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(t1);
    expect((await call<any>("GET", "/me/calendar-feed", { token: owner.token })).body.active).toBe(true);

    expect((await rawIcs(t1)).status).toBe(200);
    const t2 = tokenOf(await feedUrl(owner.token));
    expect((await rawIcs(t1)).status).toBe(404);
    expect((await rawIcs(t2)).status).toBe(200);
    expect((await call("DELETE", "/me/calendar-feed", { token: owner.token })).status).toBe(200);
    expect((await rawIcs(t2)).status).toBe(404);
    expect((await call<any>("GET", "/me/calendar-feed", { token: owner.token })).body.active).toBe(false);
  });

  it("sin token válido no hay nada: 404 y sin sesión no se crea", async () => {
    expect((await getIcs("x".repeat(30))).status).toBe(404);
    expect((await getIcs("corto")).status).toBe(404);
    expect((await call("POST", "/me/calendar-feed")).status).toBe(401);
  });

  it("sirve text/calendar con las tareas abiertas de las estancias del usuario", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const agro = await addMemberAndLogin(owner.token, "worker", "Ramón");
    await task(owner.token, { farmId, plotId: plotIds[0], assigneeId: agro.userId, title: "Pulverizar, lote 1", dueTime: "07:15", priority: "high" });
    const done = await task(owner.token, { farmId, assigneeId: agro.userId, title: "Ya hecha" });
    await call("PATCH", `/org/tasks/${done.body.id}`, { token: owner.token, body: { status: "cancelled" } });
    await task(owner.token, { farmId, assigneeId: agro.userId, title: "Vieja", dueDate: "2020-01-01" });

    const res = await rawIcs(tokenOf(await feedUrl(owner.token)));
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const ics = await res.text();
    expect(ics).toContain("SUMMARY:Pulverizar\\, lote 1");
    expect(ics).toContain("DTSTART;TZID=");
    expect(ics).toContain("T071500");
    expect(ics).toContain("PRIORITY:1");
    expect(ics).toContain("Para: Ramón");
    expect(ics).not.toContain("Ya hecha");
    expect(ics).not.toContain("Vieja");
    expect(ics).toMatch(/UID:[0-9a-f-]+@yvy/);
  });

  it("cada uno ve solo lo suyo: el empleado, solo sus tareas", async () => {
    const owner = await createOrgWithOwner();
    const { farmId, plotIds } = await createFarmWithPlots(owner.token, 1);
    const w1 = await addMemberAndLogin(owner.token, "worker", "Uno");
    const w2 = await addMemberAndLogin(owner.token, "worker", "Dos");
    for (const w of [w1, w2]) await call("PUT", `/org/members/${w.userId}/plots`, { token: owner.token, body: { plotIds: [plotIds[0]] } });
    await task(owner.token, { farmId, assigneeId: w1.userId, title: "Tarea del uno" });
    await task(owner.token, { farmId, assigneeId: w2.userId, title: "Tarea del dos" });
    const mine = await (await rawIcs(tokenOf(await feedUrl(w1.token)))).text();
    expect(mine).toContain("Tarea del uno");
    expect(mine).not.toContain("Tarea del dos");
    const all = await (await rawIcs(tokenOf(await feedUrl(owner.token)))).text();
    expect(all).toContain("Tarea del uno");
    expect(all).toContain("Tarea del dos");
  });

  it("el supervisor limitado a una estancia no ve las tareas de las otras", async () => {
    const owner = await createOrgWithOwner();
    const a = await createFarmWithPlots(owner.token, 1);
    const b = await call<{ id: string }>("POST", "/org/farms", { token: owner.token, body: { name: "Otra", geometry: square(-56.5, -26.5, 0.1) } });
    const sup = await addMemberAndLogin(owner.token, "supervisor", "Sup");
    await call("PUT", `/org/members/${sup.userId}/farms`, { token: owner.token, body: { farms: [{ farmId: a.farmId, level: "edit" }] } });
    await task(owner.token, { farmId: a.farmId, assigneeId: owner.userId, title: "En la A" });
    await task(owner.token, { farmId: b.body.id, assigneeId: owner.userId, title: "En la B" });
    const ics = await (await rawIcs(tokenOf(await feedUrl(sup.token)))).text();
    expect(ics).toContain("En la A");
    expect(ics).not.toContain("En la B");
  });

  it("si la persona deja la organización, el enlace deja de andar", async () => {
    const owner = await createOrgWithOwner();
    const w = await addMemberAndLogin(owner.token, "worker");
    const token = tokenOf(await feedUrl(w.token));
    expect((await rawIcs(token)).status).toBe(200);
    await db().update(s.memberships).set({ deletedAt: Date.now() }).where(eq(s.memberships.userId, w.userId));
    expect((await rawIcs(token)).status).toBe(404);
  });

  it("el token de una organización no abre otra aunque el usuario esté en las dos", async () => {
    const a = await createOrgWithOwner("A");
    const fa = await createFarmWithPlots(a.token, 1);
    await task(a.token, { farmId: fa.farmId, assigneeId: a.userId, title: "Solo de A" });
    const tokenA = tokenOf(await feedUrl(a.token));
    const b = await createOrgWithOwner("B");
    const tokenB = tokenOf(await feedUrl(b.token));
    expect(await (await rawIcs(tokenA)).text()).toContain("Solo de A");
    expect(await (await rawIcs(tokenB)).text()).not.toContain("Solo de A");
  });
});
