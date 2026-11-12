/** F-24: ingreso del empleado con teléfono y PIN. Permisos, hash con sal, bloqueo por intentos. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { LIMITS } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { addMemberAndLogin, call, createOrgWithOwner, db } from "./helpers";

const setPin = (token: string, userId: string, body: Record<string, unknown> = {}) =>
  call<any>("PUT", `/org/members/${userId}/pin`, { token, body });
const login = (phone: string, pin: string) => call<any>("POST", "/auth/pin/login", { body: { phone, pin, deviceId: "dev-1" } });

/** Los tests comparten la base: cada uno usa teléfonos propios (el teléfono es único para ingresar). */
let seq = 0;
const uniquePhone = () => `0981${String(100_000 + ++seq).padStart(6, "0")}`;

async function worker(phone = uniquePhone()) {
  const owner = await createOrgWithOwner();
  const w = await addMemberAndLogin(owner.token, "worker", "Ramón");
  return { owner, w, phone };
}

describe("F-24 · PIN de empleados", () => {
  it("el dueño fija un PIN y el empleado ingresa con teléfono en cualquier formato", async () => {
    const { owner, w, phone } = await worker();
    const r = await setPin(owner.token, w.userId, { pin: "483920", phone });
    expect(r.status).toBe(200);
    expect(r.body.pin).toBeUndefined();
    const digits = phone.replace(/\D/g, ""); // 0981xxxxxx
    for (const p of [digits, `+595 ${digits.slice(1)}`, digits.slice(1)]) {
      const res = await login(p, "483920");
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(w.userId);
      expect(res.body.organization).toMatchObject({ id: owner.orgId, role: "worker" });
      // La sesión sirve de verdad.
      expect((await call("GET", "/me", { token: res.body.accessToken })).status).toBe(200);
    }
  });

  it("sin PIN en el cuerpo lo genera el servidor, una sola vez, y no es trivial", async () => {
    const { owner, w, phone } = await worker();
    const r = await setPin(owner.token, w.userId, { phone });
    expect(r.body.pin).toMatch(/^\d{6}$/);
    expect(new Set(r.body.pin).size).toBeGreaterThan(1);
    expect((await login(phone, r.body.pin)).status).toBe(200);
  });

  it("guarda solo el hash con sal propia: nunca el PIN, y dos empleados con el mismo PIN tienen hashes distintos", async () => {
    const { owner, w } = await worker();
    const w2 = await addMemberAndLogin(owner.token, "worker", "Otro");
    await setPin(owner.token, w.userId, { pin: "483920", phone: uniquePhone() });
    await setPin(owner.token, w2.userId, { pin: "483920", phone: uniquePhone() });
    const rows = await db().select().from(s.userPins);
    const a = rows.find((r) => r.userId === w.userId)!;
    const b = rows.find((r) => r.userId === w2.userId)!;
    expect(a.pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(a)).not.toContain("483920");
    expect(a.salt).not.toBe(b.salt);
    expect(a.pinHash).not.toBe(b.pinHash);
  });

  it("rechaza PIN débiles o mal formados y un teléfono ya usado", async () => {
    const { owner, w } = await worker();
    expect((await setPin(owner.token, w.userId, { pin: "123456", phone: uniquePhone() })).status).toBe(400);
    expect((await setPin(owner.token, w.userId, { pin: "111111", phone: uniquePhone() })).status).toBe(400);
    expect((await setPin(owner.token, w.userId, { pin: "12ab56", phone: uniquePhone() })).status).toBe(400);
    expect((await setPin(owner.token, w.userId, { pin: "483920" })).status).toBe(400); // sin teléfono en la ficha
    const taken = uniquePhone();
    await setPin(owner.token, w.userId, { pin: "483920", phone: taken });
    const w2 = await addMemberAndLogin(owner.token, "worker", "Otro");
    // El mismo número en otro formato es el mismo teléfono.
    expect((await setPin(owner.token, w2.userId, { pin: "908172", phone: `+595${taken.slice(1)}` })).status).toBe(409);
  });

  it("permisos: el empleado y el agrónomo no gestionan PIN; solo se da a empleados", async () => {
    const { owner, w } = await worker();
    const agro = await addMemberAndLogin(owner.token, "agronomist");
    const other = await addMemberAndLogin(owner.token, "worker", "Otro");
    expect((await setPin(w.token, other.userId, { pin: "483920", phone: uniquePhone() })).status).toBe(403);
    expect((await setPin(agro.token, other.userId, { pin: "483920", phone: uniquePhone() })).status).toBe(403);
    expect((await call("DELETE", `/org/members/${other.userId}/pin`, { token: w.token })).status).toBe(403);
    // El administrador sí puede.
    const admin = await addMemberAndLogin(owner.token, "admin");
    expect((await setPin(admin.token, other.userId, { pin: "483920", phone: uniquePhone() })).status).toBe(200);
    // Ni al dueño ni al agrónomo se les da PIN.
    expect((await setPin(owner.token, agro.userId, { pin: "483920", phone: uniquePhone() })).status).toBe(403);
  });

  it("no se puede dar PIN a alguien de otra organización", async () => {
    const { w } = await worker();
    const stranger = await createOrgWithOwner("Otra estancia");
    expect((await setPin(stranger.token, w.userId, { pin: "483920", phone: uniquePhone() })).status).toBe(404);
  });

  it("PIN equivocado, teléfono desconocido y formato inválido responden igual", async () => {
    const { owner, w, phone } = await worker();
    await setPin(owner.token, w.userId, { pin: "483920", phone });
    const wrong = await login(phone, "000001");
    const unknown = await login("0981 000 000", "483920");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
    expect((await login(phone, "48392")).status).toBe(400);
  });

  it("bloquea la cuenta tras los intentos fallidos, incluso con el PIN correcto", async () => {
    const { owner, w, phone } = await worker();
    await setPin(owner.token, w.userId, { pin: "483920", phone });
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.auth.pinMaxAttempts; i++) statuses.push((await login(phone, "000001")).status);
    // Los primeros fallan con 401; el último intento permitido ya deja la cuenta bloqueada.
    expect(statuses.slice(0, -1).every((x) => x === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    const locked = await login(phone, "483920");
    expect(locked.status).toBe(429);
    const [row] = await db().select().from(s.userPins).where(eq(s.userPins.userId, w.userId));
    expect(row!.lockedUntil).toBeGreaterThan(Date.now());
  });

  it("una ráfaga en paralelo no consigue más comparaciones que el tope", async () => {
    const { owner, w, phone } = await worker();
    await setPin(owner.token, w.userId, { pin: "483920", phone });
    // 30 intentos simultáneos con 29 PIN errados y el correcto al final: el correcto no debe colarse.
    const guesses = Array.from({ length: 29 }, (_, i) => String(100001 + i));
    const res = await Promise.all([...guesses, "483920"].map((p) => login(phone, p)));
    expect(res.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    const verified = res.filter((r) => r.status === 200 || r.status === 401).length;
    expect(verified).toBeLessThanOrEqual(LIMITS.auth.pinMaxAttempts);
  });

  it("el bloqueo vence y un ingreso correcto reinicia el contador", async () => {
    const { owner, w, phone } = await worker();
    await setPin(owner.token, w.userId, { pin: "483920", phone });
    for (let i = 0; i < LIMITS.auth.pinMaxAttempts - 1; i++) await login(phone, "000001");
    expect((await login(phone, "483920")).status).toBe(200);
    const [row] = await db().select().from(s.userPins).where(eq(s.userPins.userId, w.userId));
    expect(row!.failedAttempts).toBe(0);
    // Bloqueo vencido: se simula moviendo lockedUntil al pasado.
    for (let i = 0; i < LIMITS.auth.pinMaxAttempts; i++) await login(phone, "000001");
    expect((await login(phone, "483920")).status).toBe(429);
    await db().update(s.userPins).set({ lockedUntil: Date.now() - 1 }).where(eq(s.userPins.userId, w.userId));
    expect((await login(phone, "483920")).status).toBe(200);
  });

  it("volver a fijar el PIN desbloquea; quitarlo corta el ingreso", async () => {
    const { owner, w, phone } = await worker();
    await setPin(owner.token, w.userId, { pin: "483920", phone });
    for (let i = 0; i < LIMITS.auth.pinMaxAttempts; i++) await login(phone, "000001");
    expect((await login(phone, "483920")).status).toBe(429);
    await setPin(owner.token, w.userId, { pin: "908172", phone });
    expect((await login(phone, "908172")).status).toBe(200);
    expect((await call("DELETE", `/org/members/${w.userId}/pin`, { token: owner.token })).status).toBe(200);
    expect((await login(phone, "908172")).status).toBe(401);
  });

  it("un empleado dado de baja no ingresa; /org/members informa quién tiene PIN", async () => {
    const { owner, w, phone } = await worker();
    const other = await addMemberAndLogin(owner.token, "worker", "Sin PIN");
    await setPin(owner.token, w.userId, { pin: "483920", phone });
    const list = await call<any[]>("GET", "/org/members", { token: owner.token });
    expect(list.body.find((m) => m.userId === w.userId).hasPin).toBe(true);
    expect(list.body.find((m) => m.userId === other.userId).hasPin).toBe(false);
    await db().update(s.memberships).set({ status: "disabled" }).where(eq(s.memberships.userId, w.userId));
    expect((await login(phone, "483920")).status).toBe(403);
  });
});
