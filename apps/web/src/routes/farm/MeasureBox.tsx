import { t } from "../../lib/i18n";
import { fmtHa } from "../../lib/format";
import { closedAreaHa, fmtDistance, pathLengthM } from "../../lib/measure";
import type { Measure } from "./useMeasure";

export function MeasureBox({ m }: { m: Measure }) {
  const { points, closed } = m;
  return (
    <div
      role="status"
      className="absolute bottom-8 left-3 z-10 flex w-56 flex-col gap-2 rounded-md border border-white/15 bg-surco/85 p-2.5 text-xs text-lino backdrop-blur print:hidden"
    >
      {points.length === 0 ? (
        <p className="text-lino/80">{t("ui.measureHint")}</p>
      ) : (
        <>
          <p className="num">
            {closed ? t("ui.measurePerimeter") : t("ui.measureDistance")}:{" "}
            <strong className="font-semibold">{fmtDistance(pathLengthM(points, closed))}</strong>
          </p>
          {closed && (
            <p className="num">
              {t("ui.area")}: <strong className="font-semibold">{fmtHa(closedAreaHa(points) ?? 0)}</strong>
            </p>
          )}
        </>
      )}
      <div className="flex gap-4 font-medium">
        {points.length >= 3 && !closed && (
          <button className="cursor-pointer underline-offset-4 hover:underline" onClick={m.close}>
            {t("ui.measureClose")}
          </button>
        )}
        {points.length > 0 && (
          <button className="cursor-pointer underline-offset-4 hover:underline" onClick={m.undo}>
            {t("ui.measureUndo")}
          </button>
        )}
        <button className="cursor-pointer underline-offset-4 hover:underline" onClick={m.end}>
          {t("ui.measureDone")}
        </button>
      </div>
    </div>
  );
}
