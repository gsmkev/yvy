/**
 * Pedido de prueba desde el formulario del cierre de la landing. Ruta pública, sin sesión:
 * POST /public/trial-requests guarda el pedido (consentimiento explícito, tope por conexión, campo trampa) y avisa a
 * OPS_EMAIL si está configurado. El equipo lo ve en el panel interno (/admin/trial-requests) y escribe por WhatsApp.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { LIMITS, newId, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { getDb } from "../db/client";
import { hmacHex } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { inBackground } from "../lib/dispatch";
import { parse, readJson } from "../lib/http";
import type { AppEnv } from "../types";

const DAY = 86_400_000;

/** Solo dígitos con código de país; un número paraguayo sin él (09xx, 9xx) se completa con 595. */
export const normalizePhone = (raw: string): string | null => {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("595")) d = d.slice(3);
  d = d.replace(/^0/, "");
  return /^9\d{8}$/.test(d) || /^[2-8]\d{7,8}$/.test(d) ? `595${d}` : null;
};

const optionalNumber = (max: number, int = false) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : v),
    (int ? z.number().int() : z.number()).min(0).max(max).optional(),
  );

const body = z.object({
  name: z.string().trim().min(1).max(80),
  whatsapp: z.string().trim().min(6).max(30),
  company: z.string().trim().max(120).optional(),
  crops: z.array(z.string().trim().min(1).max(40)).max(LIMITS.trialRequests.maxCrops).default([]),
  hectares: optionalNumber(LIMITS.trialRequests.maxHa),
  employees: optionalNumber(LIMITS.trialRequests.maxEmployees, true),
  department: z.string().trim().max(60).optional(),
  consent: z.literal(true, { message: t("trialRequests.consentRequired") }),
  /** Campo trampa: las personas no lo ven; si viene con algo, es un robot. */
  website: z.string().max(200).optional(),
});

export const trialRequests = new Hono<AppEnv>();

trialRequests.post("/trial-requests", async (c) => {
  const b = parse(body, await readJson(c.req));
  // Un robot que llenó el campo trampa recibe la misma respuesta y no deja nada guardado.
  if (b.website) return c.json({ ok: true });
  const phone = normalizePhone(b.whatsapp);
  if (!phone) throw new HTTPException(400, { message: t("trialRequests.badPhone") });
  const db = getDb(c.env.DB);
  const now = Date.now();
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const ipHash = ip ? await hmacHex(c.env.JWT_SECRET, `trial-ip:${ip}`) : null;
  if (ipHash) {
    const [{ n }] = (await db
      .select({ n: count() })
      .from(s.trialRequests)
      .where(and(eq(s.trialRequests.ipHash, ipHash), gte(s.trialRequests.createdAt, now - DAY)))) as [{ n: number }];
    if (n >= LIMITS.trialRequests.perIpPerDay) throw new HTTPException(429, { message: t("trialRequests.tooMany") });
  }
  await db.insert(s.trialRequests).values({
    id: newId(),
    name: b.name,
    whatsapp: phone,
    company: b.company || null,
    crops: JSON.stringify(b.crops),
    hectares: b.hectares ?? null,
    employees: b.employees ?? null,
    department: b.department || null,
    consentAt: now,
    consentVersion: LIMITS.trialRequests.consentVersion,
    ipHash,
    createdAt: now,
  });
  if (c.env.OPS_EMAIL) {
    const dash = "—";
    await inBackground(
      c,
      sendEmail(
        c.env,
        c.env.OPS_EMAIL,
        t("trialRequests.opsSubject", { name: b.name }),
        t("trialRequests.opsBody", {
          name: b.name,
          whatsapp: phone,
          company: b.company || dash,
          crops: b.crops.join(", ") || dash,
          hectares: b.hectares === undefined ? dash : String(b.hectares),
          employees: b.employees === undefined ? dash : String(b.employees),
          department: b.department || dash,
        }),
      ).catch((e) => console.error("trial-request email", e)),
    );
  }
  return c.json({ ok: true });
});
