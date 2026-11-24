/** Lectura de los datos de la pantalla Hoy. */
import { getDb } from "../lib/db";
import { byFarm, useFarmChoice } from "../lib/farmFilter";
import { memberNames } from "../lib/members";
import { isOwnerMode, recordsByAuthor, vigorDrops } from "../lib/ownerSummary";
import { useReadOnly } from "../lib/readOnly";
import { useSession } from "../lib/session";
import { teamTasksDue } from "../lib/teamTasks";
import { useLocal } from "../lib/useLocal";
import { readVotes } from "../lib/votes";

/** Todo lo que "Hoy" muestra, leído de la base local: tareas, avisos, anotaciones y el resumen del dueño. */
export function useTodayData() {
  const session = useSession();
  const userId = session?.user.id ?? "";
  const { farmId } = useFarmChoice();
  const tasks = useLocal(() => byFarm(getDb().tasksToday(userId), farmId), [userId, farmId]);
  const alerts = useLocal(() => byFarm(getDb().activeAlerts(), farmId), [farmId]);
  const plots = useLocal(() => getDb().plots());
  const votes = useLocal(() => readVotes(getDb()));
  const todayRecords = useLocal(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return byFarm(getDb().records(100), farmId).filter((r) => r.capturedAt >= start.getTime());
  }, [farmId]);
  const plotName = (id: string | null) => plots.find((p) => p.id === id)?.name ?? "";
  // Resumen del campo para dueño, administrador y agrónomo.
  const owner = isOwnerMode(session?.organization.role);
  const readOnly = useReadOnly();
  const farmPlotIds = new Set(byFarm(plots, farmId).map((p) => p.id));
  const summary = useLocal(() => {
    if (!owner) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const recs = byFarm(getDb().records(500), farmId);
    const today = recordsByAuthor(recs, start.getTime());
    const weekStart = start.getTime() - 6 * 86_400_000;
    return {
      byAuthor: today.length > 0 ? today : recordsByAuthor(recs, weekStart),
      week: today.length === 0,
      team: byFarm(getDb().openTasks(), farmId),
      worse: vigorDrops(getDb().lastTwoVigorPasses()),
      names: memberNames(getDb()),
    };
  }, [owner, farmId]);
  const worse = (summary?.worse ?? []).filter((w) => farmPlotIds.has(w.plotId));
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const team = teamTasksDue(summary?.team ?? [], userId, todayIso);
  const open = tasks.filter((x) => x.status === "open");
  const done = tasks.filter((x) => x.status === "done");
  const empty = alerts.length === 0 && tasks.length === 0 && team.length === 0 && todayRecords.length === 0;
  return { session, userId, farmId, tasks, alerts, plots, votes, todayRecords, plotName, readOnly, summary, worse, todayIso, team, open, done, empty };
}
