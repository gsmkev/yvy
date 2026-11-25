import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import {
  alertEmail,
  emailSamples,
  isDeliverable,
  leadEmail,
  loginCodeEmail,
  mentionEmail,
  sendEmail,
  sendEmailBatch,
  trialRequestEmail,
  weeklyEmail,
  type EmailMessage,
} from "../src/lib/email";
import { createOrgWithOwner, createStaff } from "./helpers";

const APP = "https://app.yvy.test";
const XSS = `<script>alert("x")</script> 'quote' & "dq"`;
const mailEnv = { ...env, RESEND_API_KEY: "re_test", EMAIL_FROM: "Yvy <hola@yvy.test>", APP_URL: APP };

afterEach(() => vi.unstubAllGlobals());

const alertInput = (over: Record<string, unknown> = {}) => ({
  kind: "frost",
  severity: "warning" as const,
  probability: "high",
  summary: "Posible helada",
  details: { days: [{ date: "2026-11-10", tminC: -1.5 }] },
  validFrom: Date.parse("2026-11-10T12:00:00Z"),
  validTo: Date.parse("2026-11-11T12:00:00Z"),
  farmId: "f1",
  farmName: "San Pedro",
  tz: "America/Asuncion",
  source: "MET Norway",
  appUrl: APP,
  ...over,
});

const weeklyInput = (over: Record<string, unknown> = {}) => ({
  farmId: "f1",
  farmName: "San Pedro",
  from: "2026-11-02",
  to: "2026-11-08",
  records: 10,
  authors: 2,
  rainMm: 12,
  alerts: ["Aviso"],
  overdueTasks: 1,
  byKind: [{ kind: "rain", n: 3 }],
  hasPdf: true,
  appUrl: APP,
  ...over,
});

const FORBIDDEN = [/<img/i, /<script/i, /<form/i, /<iframe/i, /javascript:/i, /<link/i, /@import/i, /url\(/i];

describe("plantillas de correo", () => {
  const samples = emailSamples(APP);

  it("hay una muestra de cada tipo y variante", () => {
    expect(samples).toHaveLength(18);
    expect(samples.every((m) => m.subject.startsWith("[Prueba] "))).toBe(true);
  });

  it.each(samples.map((m, i) => [i, m.subject, m] as const))("muestra %i (%s) es multiparte y seguro", (_i, _s, m) => {
    expect(m.html.startsWith("<!doctype html>")).toBe(true);
    expect(m.html).toContain('<html lang="es"');
    expect(m.html).toContain("<meta charset");
    expect(m.html).toContain("prefers-color-scheme:dark");
    expect(m.html).toContain(`<title>${m.subject.replace(/'/g, "&#39;")}</title>`);
    expect(m.text.length).toBeGreaterThan(20);
    expect(Buffer.byteLength(m.html)).toBeLessThan(100_000);
    for (const bad of FORBIDDEN) expect(m.html).not.toMatch(bad);
    // los enlaces van al dominio de la app (o al informe firmado) y el texto de un enlace no es una URL
    for (const [, url, label] of m.html.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)) {
      expect(url!.startsWith(APP)).toBe(true);
      expect(label).not.toMatch(/https?:/);
    }
  });

  it("los 9 avisos llevan su dato protagonista y el encabezado List-Unsubscribe", () => {
    const alerts = samples.filter((m) => m.headers?.["List-Unsubscribe"] && m.subject.includes(" en Estancia San Pedro"));
    expect(alerts).toHaveLength(9);
    for (const m of alerts) expect(m.headers!["List-Unsubscribe"]).toBe(`<${APP}/cuenta>`);
  });

  it("el parte externo no lleva enlaces que pidan sesión ni List-Unsubscribe", () => {
    const m = weeklyEmail(weeklyInput({ externalOrg: "Org" }));
    expect(m.html).not.toContain("<a href");
    expect(m.headers).toBeUndefined();
    expect(m.text).toContain("te comparte este informe");
    expect(weeklyEmail(weeklyInput()).headers?.["List-Unsubscribe"]).toBeDefined();
  });

  it("el código de ingreso lleva el código en el asunto, el HTML y el texto, sin botón", () => {
    const m = loginCodeEmail({ code: "123456", minutes: 10 });
    expect(m.subject).toContain("123456");
    expect(m.html).toContain("123456");
    expect(m.text).toContain("123456");
    expect(m.html).not.toContain("<a href");
  });

  it("escapa todo contenido variable", () => {
    const msgs: EmailMessage[] = [
      alertEmail(alertInput({ farmName: XSS, summary: XSS, source: XSS })),
      alertEmail(alertInput({ kind: "water_low", details: { pois: [{ name: XSS, level: "dry" }] } })),
      mentionEmail({ author: XSS, body: XSS, appUrl: APP }),
      weeklyEmail(weeklyInput({ farmName: XSS, alerts: [XSS], externalOrg: XSS })),
      leadEmail({ link: `${APP}/informe/1/"><script>`, days: 90 }),
      trialRequestEmail({ name: XSS, whatsapp: "1", company: XSS, crops: XSS, hectares: "1", employees: "1", department: XSS, appUrl: APP }),
    ];
    for (const m of msgs) {
      expect(m.html).not.toContain("<script");
      expect(m.html).toMatch(/&lt;script&gt;|&quot;&gt;&lt;script/);
    }
  });

  it("pesa menos de 100 KB aunque los datos sean enormes", () => {
    const big = "x".repeat(300_000);
    const msgs = [
      alertEmail(alertInput({ farmName: big, summary: big })),
      mentionEmail({ author: big, body: big, appUrl: APP }),
      weeklyEmail(weeklyInput({ farmName: big, alerts: Array(500).fill(big), byKind: Array(300).fill({ kind: "rain", n: 1 }) })),
    ];
    for (const m of msgs) expect(Buffer.byteLength(m.html)).toBeLessThan(100_000);
  });

  it("un aviso sin detalle sigue siendo un correo válido", () => {
    const m = alertEmail(alertInput({ details: "no es json", kind: "drought" }));
    expect(m.html).toContain("Sequía");
    expect(m.text).toContain("Posible helada");
  });
});

describe("aviso de fuego", () => {
  it("la cifra de focos y la barra de hoy salen del mismo dato", () => {
    const today = "2026-11-25";
    const now = Date.parse(`${today}T15:00:00Z`);
    const days = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ date: `2026-11-${String(19 + n)}`, n: n === 6 ? 3 : 1 }));
    const m = alertEmail(
      alertInput({
        kind: "fire",
        details: { minDistanceKm: 3.2, windTowardsFarm: true, hotspots: 9 },
        context: { now, days: [], hours: [], plots: [], rainDaily: [], hotspotsByDay: days },
      }),
    );
    expect(m.html).toContain("Focos hoy");
    expect(m.html).not.toContain("Focos detectados");
    expect(m.html).toMatch(/>Focos hoy<\/div><div[^>]*>3<\/div>/);
    expect(m.html).toMatch(/font-weight:700;[^"]*">3<\/div>/); // la barra destacada de hoy dice 3
    expect(m.html).not.toMatch(/>9<\/div>/);
  });
});

describe("envío", () => {
  const capture = () => {
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string) });
        return new Response("{}", { status: 200 });
      }),
    );
    return calls;
  };

  it("sendEmail manda html y text a Resend", async () => {
    const calls = capture();
    await sendEmail(mailEnv as never, "a@b.py", loginCodeEmail({ code: "111222", minutes: 10 }));
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.body.html).toContain("111222");
    expect(calls[0]!.body.text).toContain("111222");
    expect(calls[0]!.body.to).toBe("a@b.py");
  });

  it("sendEmailBatch parte en tandas de 100 y lleva los encabezados", async () => {
    const calls = capture();
    const message = alertEmail(alertInput());
    await sendEmailBatch(mailEnv as never, Array.from({ length: 150 }, (_, i) => ({ to: `u${i}@b.py`, message })));
    expect(calls.map((c) => c.body.length)).toEqual([100, 50]);
    expect(calls[0]!.body[0].headers["List-Unsubscribe"]).toBe(`<${APP}/cuenta>`);
    expect(calls[0]!.body[0].html).toBeTruthy();
  });

  it("no manda a dominios reservados (usuarios de la demo y de pruebas) para no generar rebotes", async () => {
    for (const to of ["demo@yvy.invalid", "a@example.com", "b@host.localhost", "c@foo.example"]) expect(isDeliverable(to)).toBe(false);
    for (const to of ["kevin@koeti.com.py", "ana@gmail.com", "x@invalid.com.py", "dueno@yvy.test"]) expect(isDeliverable(to)).toBe(true);
    const calls = capture();
    const message = loginCodeEmail({ code: "1", minutes: 1 });
    await sendEmail(mailEnv as never, "demo@yvy.invalid", message);
    await sendEmailBatch(mailEnv as never, [
      { to: "maria@yvy.invalid", message },
      { to: "ana@b.py", message },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.map((m: { to: string }) => m.to)).toEqual(["ana@b.py"]);
  });

  it("sendEmailBatch lanza si Resend rechaza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(sendEmailBatch(mailEnv as never, [{ to: "a@b.py", message: loginCodeEmail({ code: "1", minutes: 1 }) }])).rejects.toThrow("Resend 500");
  });
});

describe("POST /admin/email-samples", () => {
  const post = (token: string) => app.request("/admin/email-samples", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" }, mailEnv);

  it("un no admin recibe 403 y no sale nada", async () => {
    const calls = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", calls);
    const owner = await createOrgWithOwner();
    expect((await post(owner.token)).status).toBe(403);
    expect(calls).not.toHaveBeenCalled();
  });

  it("el admin recibe todas las muestras, con html y text, solo en el email de su sesión", async () => {
    const sent: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        sent.push(...JSON.parse(init.body as string));
        return new Response("{}");
      }),
    );
    const staff = await createStaff();
    const res = await post(staff.token);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sent: number }).sent).toBe(18);
    expect(sent).toHaveLength(18);
    for (const m of sent) {
      expect(m.to).toBe("staff@yvy.test");
      expect(m.html).toContain("<!doctype html>");
      expect(m.text.length).toBeGreaterThan(20);
      expect(m.subject).toMatch(/^\[Prueba\] /);
    }
  });
});
