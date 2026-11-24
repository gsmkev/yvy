/** Sección de áreas problema de la ficha del lote. */
import { fmtDate, fmtHa, fmtNdvi } from "../../lib/format";
import { t } from "../../lib/i18n";
import { ErrorBox, Field, Select } from "../ui";
import type { Member, ProblemArea } from "../../lib/types";
import type { ProblemTask } from "./usePlotData";

/**
 * Lista de áreas problema con la opción de mandar una recorrida a una persona.
 * @param task estado de la tarea (de `useProblemTask`).
 * @param onShowArea centra el mapa en el área.
 */
export function ProblemAreasSection({
  workers,
  problemAreas,
  task,
  onShowArea,
}: {
  workers: Member[];
  problemAreas: ProblemArea[];
  task: ProblemTask;
  onShowArea?: (a: ProblemArea) => void;
}) {
  const { assigneeId, setAssigneeId, sendArea } = task;
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.problem.areasTitle")}</h3>
      <p className="mb-2 text-xs text-tinta-2">
        {t("ui.problem.areasHint", { date: fmtDate(problemAreas[0]!.acquiredAt) })}
      </p>
      {workers.length > 1 && (
        <Field label={t("ui.problem.taskTo")}>
          <Select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={workers.map((w) => ({ value: w.userId, label: w.fullName }))}
          />
        </Field>
      )}
      {workers.length === 0 && <p className="mb-2 text-xs text-tinta-2">{t("ui.problem.taskNoWorker")}</p>}
      <ul className="flex flex-col gap-3 text-sm">
        {problemAreas.map((a) => (
          <li key={a.id} className="flex flex-col gap-1">
            <span className="num">
              {fmtHa(a.areaHa)} · {t("ui.problem.areaNdvi", { v: fmtNdvi(a.meanNdvi), m: fmtNdvi(a.plotMedianNdvi) })}
            </span>
            <span className="flex gap-4">
              <button
                className="cursor-pointer text-accion underline underline-offset-2"
                onClick={() => onShowArea?.(a)}
              >
                {t("ui.problem.areaShow")}
              </button>
              <button
                className="cursor-pointer text-accion underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={workers.length === 0 || sendArea.isPending}
                onClick={() => sendArea.mutate(a)}
              >
                {sendArea.isPending ? t("ui.problem.taskSending") : t("ui.problem.taskSend")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {sendArea.error && <ErrorBox error={sendArea.error} />}
    </div>
  );
}
