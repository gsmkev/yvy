/**
 * P-08: segundo factor TOTP. Corre junto con el ingreso (antes de que haya sesión) o sobre la cuenta propia de quien
 * ya ingresó, por eso usa la base directa y no ScopedDb: nunca toca datos de la organización, solo del propio usuario.
 */
import { and, count, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { LIMITS, newId } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { runBatch, type DB } from "../db/client";
import { openSecret, sealSecret } from "../lib/crypto";
import { matchTotp, newRecoveryCode, newTotpSecret, normalizeRecoveryCode, otpauthUri, recoveryHash } from "../lib/totp";

export type SecondFactor = "ok" | "bad" | "locked";

export async function totpEnabled(db: DB, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ at: s.userTotp.enabledAt })
    .from(s.userTotp)
    .where(eq(s.userTotp.userId, userId))
    .limit(1);
  return row?.at != null;
}

/** ¿Es administrador de una organización que exige segundo factor y todavía no lo dio de alta? */
export async function totpSetupRequired(db: DB, userId: string, orgId: string, role: string): Promise<boolean> {
  if (role !== "admin") return false;
  const [org] = await db
    .select({ on: s.organizations.requireAdminTotp })
    .from(s.organizations)
    .where(eq(s.organizations.id, orgId))
    .limit(1);
  return !!org?.on && !(await totpEnabled(db, userId));
}

/**
 * Verifica un código de 6 dígitos o un código de recuperación. Cada intento se cuenta ANTES de mirar el código (UPDATE
 * atómico), así que las ráfagas en paralelo no se pasan del tope. Un código TOTP ya aceptado no sirve de nuevo.
 * Con `pending` se verifica el alta todavía sin confirmar (sin códigos de recuperación).
 */
export async function checkSecondFactor(
  db: DB,
  jwtSecret: string,
  userId: string,
  input: string,
  now: number,
  pending = false,
): Promise<SecondFactor> {
  const [row] = await db.select().from(s.userTotp).where(eq(s.userTotp.userId, userId)).limit(1);
  if (!row || (pending ? row.enabledAt != null : row.enabledAt == null)) return "bad";
  const [bumped] = await db
    .update(s.userTotp)
    .set({ failedAttempts: sql`${s.userTotp.failedAttempts} + 1` })
    .where(and(eq(s.userTotp.userId, userId), or(isNull(s.userTotp.lockedUntil), lte(s.userTotp.lockedUntil, now))))
    .returning({ n: s.userTotp.failedAttempts });
  if (!bumped) return "locked";
  const lock = () =>
    db.update(s.userTotp).set({ failedAttempts: 0, lockedUntil: now + LIMITS.auth.totpLockMs }).where(eq(s.userTotp.userId, userId));
  if (bumped.n > LIMITS.auth.totpMaxAttempts) {
    await lock();
    return "locked";
  }

  let ok = false;
  const code = input.trim();
  if (/^\d{6}$/.test(code)) {
    const secret = await openSecret(jwtSecret, row.secretEnc);
    const step = secret ? await matchTotp(secret, code, now) : null;
    if (step !== null) {
      const taken = await db
        .update(s.userTotp)
        .set({ lastStep: step })
        .where(and(eq(s.userTotp.userId, userId), lt(s.userTotp.lastStep, step)))
        .returning({ u: s.userTotp.userId });
      ok = taken.length > 0;
    }
  } else if (!pending) {
    const norm = normalizeRecoveryCode(code);
    if (norm) {
      const used = await db
        .update(s.totpRecoveryCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(s.totpRecoveryCodes.userId, userId),
            eq(s.totpRecoveryCodes.codeHash, await recoveryHash(userId, norm)),
            isNull(s.totpRecoveryCodes.usedAt),
          ),
        )
        .returning({ id: s.totpRecoveryCodes.id });
      ok = used.length > 0;
    }
  }
  if (!ok) {
    if (bumped.n >= LIMITS.auth.totpMaxAttempts) {
      await lock();
      return "locked";
    }
    return "bad";
  }
  await db.update(s.userTotp).set({ failedAttempts: 0, lockedUntil: null }).where(eq(s.userTotp.userId, userId));
  return "ok";
}

/** Alta: genera (o reemplaza, si no se confirmó) el secreto. Devuelve el secreto en base32 y la URI para el QR. */
export async function beginSetup(db: DB, jwtSecret: string, userId: string, account: string, now: number) {
  if (await totpEnabled(db, userId)) return null;
  const secret = newTotpSecret();
  const sealed = await sealSecret(jwtSecret, secret);
  await db
    .insert(s.userTotp)
    .values({ userId, secretEnc: sealed, createdAt: now })
    .onConflictDoUpdate({
      target: s.userTotp.userId,
      set: { secretEnc: sealed, enabledAt: null, lastStep: 0, failedAttempts: 0, lockedUntil: null, createdAt: now },
    });
  return { secret, otpauth: otpauthUri(secret, account) };
}

/** Códigos nuevos (reemplazan a los anteriores, usados o no). Se devuelven una sola vez; en la base queda el SHA-256. */
export async function issueRecoveryCodes(db: DB, userId: string, now: number): Promise<string[]> {
  const codes = Array.from({ length: LIMITS.auth.totpRecoveryCodes }, newRecoveryCode);
  const rows = await Promise.all(
    codes.map(async (c) => ({
      id: newId(),
      userId,
      codeHash: await recoveryHash(userId, normalizeRecoveryCode(c)!),
      createdAt: now,
    })),
  );
  await runBatch(db, [
    db.delete(s.totpRecoveryCodes).where(eq(s.totpRecoveryCodes.userId, userId)),
    db.insert(s.totpRecoveryCodes).values(rows),
  ]);
  return codes;
}

export async function disableTotp(db: DB, userId: string): Promise<void> {
  await runBatch(db, [
    db.delete(s.userTotp).where(eq(s.userTotp.userId, userId)),
    db.delete(s.totpRecoveryCodes).where(eq(s.totpRecoveryCodes.userId, userId)),
  ]);
}

export async function totpStatus(db: DB, userId: string) {
  const enabled = await totpEnabled(db, userId);
  if (!enabled) return { enabled, recoveryLeft: 0 };
  const [{ n }] = (await db
    .select({ n: count() })
    .from(s.totpRecoveryCodes)
    .where(and(eq(s.totpRecoveryCodes.userId, userId), isNull(s.totpRecoveryCodes.usedAt)))) as [{ n: number }];
  return { enabled, recoveryLeft: n };
}
