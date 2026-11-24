/** Preferencias de notificación, recorrido de primera vez y formularios configurables. */
import { eq } from "drizzle-orm";
import { notifyOptionsFor, parseNotificationPrefs, type NotificationPrefs } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import type { FormConfig } from "@yvy/shared";
import { can, type ScopedDb } from "../scoped";

// ---------- Preferencias de notificación (U-29) ----------

/** Preferencias del usuario de la sesión (valen para todas sus organizaciones) y qué le llega según su rol. */
export async function getNotificationPrefs(sdb: ScopedDb) {
  const [row] = await sdb.db
    .select({ prefs: s.notificationPrefs.prefs })
    .from(s.notificationPrefs)
    .where(eq(s.notificationPrefs.userId, sdb.auth.userId))
    .limit(1);
  const [u] = await sdb.db
    .select({ email: s.users.email })
    .from(s.users)
    .where(eq(s.users.id, sdb.auth.userId))
    .limit(1);
  const opts = notifyOptionsFor(sdb.auth.role);
  return {
    prefs: parseNotificationPrefs(row?.prefs),
    kinds: opts.kinds,
    email: opts.email && !!u?.email,
  };
}

export async function saveNotificationPrefs(sdb: ScopedDb, prefs: NotificationPrefs) {
  const ts = sdb.now();
  await sdb.db
    .insert(s.notificationPrefs)
    .values({ userId: sdb.auth.userId, prefs: JSON.stringify(prefs), updatedAt: ts })
    .onConflictDoUpdate({
      target: s.notificationPrefs.userId,
      set: { prefs: JSON.stringify(prefs), updatedAt: ts },
    });
}

// ---------- Recorrido de primera vez (U-24) ----------

/** El estado de la guía de los 4 pasos es de la persona, no del navegador: se oculta una vez y vale en todos sus dispositivos. */
export async function getOnboarding(sdb: ScopedDb) {
  const [row] = await sdb.db
    .select({ dismissedAt: s.onboardingState.dismissedAt })
    .from(s.onboardingState)
    .where(eq(s.onboardingState.userId, sdb.auth.userId))
    .limit(1);
  return { dismissedAt: row?.dismissedAt ?? null };
}

export async function saveOnboarding(sdb: ScopedDb, dismissed: boolean) {
  const ts = sdb.now();
  const dismissedAt = dismissed ? ts : null;
  await sdb.db
    .insert(s.onboardingState)
    .values({ userId: sdb.auth.userId, dismissedAt, updatedAt: ts })
    .onConflictDoUpdate({ target: s.onboardingState.userId, set: { dismissedAt, updatedAt: ts } });
  return { dismissedAt };
}

// ---------- Formularios configurables (F-14) ----------

/** Campos propios de la organización por tipo de registro. Los lee todo el equipo: el empleado los llena en la app. */
export async function getFormConfig(sdb: ScopedDb): Promise<{ config: FormConfig; updatedAt: number | null }> {
  const [row] = await sdb.db
    .select({ config: s.formConfigs.config, updatedAt: s.formConfigs.updatedAt })
    .from(s.formConfigs)
    .where(eq(s.formConfigs.organizationId, sdb.auth.orgId))
    .limit(1);
  return row ? { config: JSON.parse(row.config) as FormConfig, updatedAt: row.updatedAt } : { config: {}, updatedAt: null };
}

export async function saveFormConfig(sdb: ScopedDb, config: FormConfig): Promise<{ updatedAt: number }> {
  sdb.require(can.manageForms, "Solo el dueño o el administrador definen los formularios");
  const updatedAt = sdb.now();
  const row = { config: JSON.stringify(config), updatedAt, updatedBy: sdb.auth.userId };
  await sdb.db
    .insert(s.formConfigs)
    .values({ organizationId: sdb.auth.orgId, ...row })
    .onConflictDoUpdate({ target: s.formConfigs.organizationId, set: row });
  return { updatedAt };
}
