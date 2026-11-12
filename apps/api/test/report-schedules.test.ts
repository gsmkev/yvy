/** R-10: informes programados por email a terceros. */
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isFirstMondayOfMonth, runJob } from "../src/jobs";
import { addMemberAndLogin, call, createFarmWithPlots, createOrgWithOwner } from "./helpers";

afterEach(() => vi.unstubAllGlobals());
const mailEnv = { ...env, RESEND_API_KEY: "re_test", EMAIL_FROM: "Yvy <parte@yvy.test>" };
const captureMail = () => {
  const sent: { to: string; subject: string; text: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response("{}", { status: 200 });
    }),
  );
  return sent;
};
const create = (token: string, body: unknown) => call<{ id: string }>("POST", "/org/report-schedules", { token, body });

describe("R-10 · informes programados", () => {
  it("el dueño y el administrador los programan; los demás no", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    const admin = await addMemberAndLogin(owner.token, "admin");
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const worker = await addMemberAndLogin(owner.token, "worker");
    const body = { farmId, name: "Banco", email: "banco@example.com", frequency: "monthly" };
    expect((await create(owner.token, body)).status).toBe(201);
    expect((await create(admin.token, { ...body, email: "socio@example.com", frequency: "weekly" })).status).toBe(201);
    expect((await create(agro.token, body)).status).toBe(403);
    expect((await create(worker.token, body)).status).toBe(403);
    expect((await call("GET", "/org/report-schedules", { token: agro.token })).status).toBe(403);
    expect((await create(owner.token, { ...body, email: "no-es-email" })).status).toBe(400);
    const list = await call<{ id: string; email: string }[]>("GET", "/org/report-schedules", { token: owner.token });
    expect(list.body.map((r) => r.email)).toEqual(["banco@example.com", "socio@example.com"]);
    expect((await call("DELETE", `/org/report-schedules/${list.body[0]!.id}`, { token: owner.token })).status).toBe(200);
    expect((await call("DELETE", `/org/report-schedules/${list.body[0]!.id}`, { token: owner.token })).status).toBe(404);
  });

  it("no se programa sobre estancias de otra organización ni pasa el tope", async () => {
    const a = await createOrgWithOwner("A");
    const b = await createOrgWithOwner("B");
    const fb = await createFarmWithPlots(b.token, 1);
    expect((await create(a.token, { farmId: fb.farmId, name: "Xavier", email: "x@example.com", frequency: "weekly" })).status).toBe(404);
    for (let i = 0; i < 10; i++)
      expect((await create(a.token, { name: `Socio ${i}`, email: `s${i}@example.com`, frequency: "weekly" })).status).toBe(201);
    expect((await create(a.token, { name: "Once", email: "once@example.com", frequency: "weekly" })).status).toBe(403);
  });

  it("el job semanal manda el parte a los externos: semanales siempre, mensuales solo el primer lunes", async () => {
    const owner = await createOrgWithOwner();
    const { farmId } = await createFarmWithPlots(owner.token, 1);
    await create(owner.token, { farmId, name: "Socio", email: "socio@example.com", frequency: "weekly" });
    await create(owner.token, { name: "Banco", email: "banco@example.com", frequency: "monthly" });
    const mail = captureMail();
    const day = (iso: string) => vi.spyOn(Date, "now").mockReturnValue(Date.parse(iso));
    const spy = day("2026-11-09T13:00:00Z"); // segundo lunes
    await runJob({ type: "weekly_report", farmId }, mailEnv as never, { fetch, now: Date.now });
    expect(mail.map((m) => m.to).filter((t) => t.endsWith("example.com"))).toEqual(["socio@example.com"]);
    mail.length = 0;
    spy.mockReturnValue(Date.parse("2026-12-07T13:00:00Z")); // primer lunes de diciembre
    await runJob({ type: "weekly_report", farmId }, mailEnv as never, { fetch, now: Date.now });
    expect(mail.map((m) => m.to).filter((t) => t.endsWith("example.com")).sort()).toEqual(["banco@example.com", "socio@example.com"]);
    expect(mail.find((m) => m.to === "banco@example.com")!.text).toContain("te comparte este informe");
    spy.mockRestore();
    const list = await call<{ lastSentAt: number | null }[]>("GET", "/org/report-schedules", { token: owner.token });
    expect(list.body.every((r) => r.lastSentAt !== null)).toBe(true);
  });

  it("primer lunes del mes", () => {
    expect(isFirstMondayOfMonth(Date.parse("2026-12-07T13:00:00Z"), "America/Asuncion")).toBe(true);
    expect(isFirstMondayOfMonth(Date.parse("2026-11-09T13:00:00Z"), "America/Asuncion")).toBe(false);
  });
});
