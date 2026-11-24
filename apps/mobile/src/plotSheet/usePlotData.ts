/** Lectura de los datos de la ficha del lote desde la base local. */
import { getDb } from "../lib/db";
import { latestVigorByPlot, localPlans, localSeasons, rotationFromLocal, vigorHistory } from "../lib/plotInfo";
import { useLocal } from "../lib/useLocal";

const RECENT = 10;

/** Todo lo que la ficha del lote lee de la base local (vigor, lluvia, tareas, anotaciones y, para oficina, historial y rotación). */
export function usePlotData(id: string, office: boolean) {
  return useLocal(() => {
    const db = getDb();
    const plot = db.plots().find((p) => p.id === id) ?? null;
    if (!plot) return null;
    const passes = db
      .lastTwoVigorPasses()
      .filter((p) => p.plotId === plot.id)
      .sort((a, b) => b.acquiredAt - a.acquiredAt);
    const latest = latestVigorByPlot(db);
    const mates = new Set(db.plots(plot.farmId).map((p) => p.id));
    return {
      plot,
      records: db.recordsOfPlot(plot.id, RECENT),
      tasks: db.openTasksListOfPlot(plot.id),
      rainMonth: db.rainThisMonth(plot.farmId),
      vigor: passes[0] ?? null,
      previous: passes[1] ?? null,
      lastVisit: db.lastVisitByPlot().get(plot.id) ?? null,
      history: office ? vigorHistory(db, plot.id) : [],
      farmMeans: [...latest].filter(([pid]) => mates.has(pid)).map(([, v]) => v.mean),
      rotation: office && plot.kind === "crop" ? rotationFromLocal(localSeasons(db), localPlans(db), plot.id) : [],
    };
  }, [id, office]);
}
