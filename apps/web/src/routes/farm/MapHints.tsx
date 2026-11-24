import { X } from "lucide-react";
import { t } from "../../lib/i18n";
import type { FarmEditing, TaskPicking } from "./useFarmEditing";

const HINT = "absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2";

/** Avisos flotantes sobre el mapa mientras se elige, divide, une o dibuja. */
export function MapHints({ edit, task }: { edit: FarmEditing; task: TaskPicking }) {
  const { mode, splitting, mergeFrom, lineDraw } = edit;
  const { picking, taskPlots } = task;
  return (
    <>
      {picking && (
        <div className={`${HINT} flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-surco px-4 py-2.5 text-sm text-lino`}>
          <span>{t("ui.task.pickHint")}</span>
          <span className="num font-semibold">{t("ui.task.pickCount", { n: taskPlots.length })}</span>
          <button className="cursor-pointer font-medium underline underline-offset-4" onClick={() => task.setPicking(false)}>
            {t("ui.task.pickDone")}
          </button>
          {taskPlots.length > 0 && (
            <button className="cursor-pointer underline-offset-4 hover:underline" onClick={() => task.setTaskPlots([])}>
              {t("ui.task.pickClear")}
            </button>
          )}
        </div>
      )}
      {(splitting || mergeFrom || lineDraw) && !edit.splitLine && !edit.mergeWith && !edit.newLine && (
        <div className={`${HINT} items-center gap-3 rounded-md bg-surco px-4 py-2.5 text-sm text-lino`}>
          {splitting ? t("ui.split.hint") : lineDraw ? t("ui.lines.hint") : t("ui.merge.pick")}
          <button
            className="cursor-pointer font-medium underline underline-offset-4"
            onClick={() => {
              edit.setSplitting(null);
              edit.setMergeFrom(null);
              edit.setLineDraw(false);
            }}
          >
            {t("ui.common.cancel")}
          </button>
        </div>
      )}
      {mode !== "none" && mode !== "import" && !picking && (
        <div className="anim-fade absolute bottom-12 left-1/2 max-w-[calc(100%-2rem)] flex -translate-x-1/2 items-center gap-3 rounded-md bg-surco px-4 py-2.5 text-sm text-lino shadow-lg">
          {mode === "poi" ? t("ui.common.clickMapForPoi") : t("ui.draw.hint")}
          <button
            aria-label={t("ui.common.cancel")}
            className="cursor-pointer rounded p-0.5 hover:bg-white/10"
            onClick={() => edit.setMode("none")}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
