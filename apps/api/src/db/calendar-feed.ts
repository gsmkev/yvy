/**
 * I-04: feed iCalendar de tareas por usuario. El token es secreto y revocable; en la base queda solo su SHA-256.
 * Los programas de calendario piden el .ics sin sesión, así que el feed arma un ScopedDb con el usuario y la organización
 * del token (y su rol actual): ve lo mismo que vería en la web, ni más ni menos.
 */
import { and, eq, isNull } from "drizzle-orm";
import { localDate, newId, t } from "@yvy/shared";
import * as s from "@yvy/shared/schema";
import { randomToken, sha256Hex } from "../lib/crypto";
import { buildCalendar, type IcsEvent } from "../lib/ical";
import type { DB } from "./client";
import { listTasks } from "./queries";
import { ScopedDb } from "./scoped";

/** Tareas de hasta 30 días atrás: lo anterior ya no sirve en un calendario. */
const BACK_DAYS = 30;
const TOUCH_EVERY_MS = 10 * 60 * 1000;

const active = (userId: string, orgId: string) =>
  and(eq(s.calendarFeeds.userId, userId), eq(s.calendarFeeds.organizationId, orgId), isNull(s.calendarFeeds.revokedAt));

export async function feedStatus(sdb: ScopedDb) {
  const [f] = await sdb.db
    .select({ createdAt: s.calendarFeeds.createdAt, lastUsedAt: s.calendarFeeds.lastUsedAt })
    .from(s.calendarFeeds)
    .where(active(sdb.auth.userId, sdb.auth.orgId))
    .limit(1);
  return f ? { active: true as const, ...f } : { active: false as const, createdAt: null, lastUsedAt: null };
}

/** Crea el enlace (revoca el anterior, si había). El token se devuelve una sola vez. */
export async function createFeed(sdb: ScopedDb, now = sdb.now()): Promise<string> {
  const token = randomToken(24);
  await sdb.db.batch([
    sdb.db
      .update(s.calendarFeeds)
      .set({ revokedAt: now })
      .where(active(sdb.auth.userId, sdb.auth.orgId)),
    sdb.db.insert(s.calendarFeeds).values({
      id: newId(),
      userId: sdb.auth.userId,
      organizationId: sdb.auth.orgId,
      tokenHash: await sha256Hex(token),
      createdAt: now,
    }),
  ]);
  return token;
}

export async function revokeFeed(sdb: ScopedDb, now = sdb.now()): Promise<void> {
  await sdb.db.update(s.calendarFeeds).set({ revokedAt: now }).where(active(sdb.auth.userId, sdb.auth.orgId));
}

/** El .ics de quien tiene ese token, o null si no existe, se revocó o la persona ya no es miembro activo. */
export async function renderFeed(db: DB, token: string, appUrl: string, now = Date.now()): Promise<string | null> {
  const [feed] = await db
    .select()
    .from(s.calendarFeeds)
    .where(and(eq(s.calendarFeeds.tokenHash, await sha256Hex(token)), isNull(s.calendarFeeds.revokedAt)))
    .limit(1);
  if (!feed) return null;
  const [m] = await db
    .select({ role: s.memberships.role })
    .from(s.memberships)
    .where(
      and(
        eq(s.memberships.userId, feed.userId),
        eq(s.memberships.organizationId, feed.organizationId),
        eq(s.memberships.status, "active"),
        isNull(s.memberships.deletedAt),
      ),
    )
    .limit(1);
  if (!m) return null;
  if (!feed.lastUsedAt || now - feed.lastUsedAt > TOUCH_EVERY_MS)
    await db.update(s.calendarFeeds).set({ lastUsedAt: now }).where(eq(s.calendarFeeds.id, feed.id));

  const sdb = new ScopedDb(db, { userId: feed.userId, orgId: feed.organizationId, role: m.role }, () => now);
  const [org] = await db
    .select({ name: s.organizations.name })
    .from(s.organizations)
    .where(eq(s.organizations.id, feed.organizationId))
    .limit(1);
  const farms = await db
    .select({ id: s.farms.id, name: s.farms.name, tz: s.farms.timezone })
    .from(s.farms)
    .where(and(eq(s.farms.organizationId, feed.organizationId), isNull(s.farms.deletedAt), sdb.workerFilter("farms")));
  const byFarm = new Map(farms.map((f) => [f.id, f]));
  const from = localDate(now - BACK_DAYS * 86_400_000);
  const rows = (await listTasks(sdb, { status: "open", from })).filter((r) => byFarm.has(r.task.farmId));

  const events: IcsEvent[] = rows.map(({ task, assigneeName, plotName }) => {
    const farm = byFarm.get(task.farmId)!;
    const where = [farm.name, plotName].filter(Boolean).join(" · ");
    return {
      uid: `${task.id}@yvy`,
      stamp: task.updatedAt,
      date: task.dueDate,
      time: task.dueTime,
      tz: farm.tz,
      summary: task.title,
      description: [where, assigneeName && assigneeName !== "" ? t("ui.calendarFeedAssignee", { name: assigneeName }) : null]
        .filter(Boolean)
        .join("\n"),
      priority: task.priority === "high" ? 1 : task.priority === "low" ? 9 : 5,
      ...(task.lat != null && task.lon != null ? { geo: { lat: task.lat, lon: task.lon } } : {}),
      url: `${appUrl.replace(/\/$/, "")}/tareas`,
    };
  });
  return buildCalendar(t("ui.calendarFeedName", { org: org?.name ?? "Yvy" }), events);
}

