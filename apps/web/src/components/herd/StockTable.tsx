/** Tabla de hacienda por potrero: cabezas por categoría, carga animal y carga recomendada. */
import { HERD_CATEGORIES, type FarmStockResponse } from "@yvy/shared";
import { fmtDay } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { ExportableTable } from "../ExportableTable";
import { dec, int } from "./herdFormat";

type PlotRow = FarmStockResponse["plots"][number];

/** Diferencia entre la carga actual y la recomendada, en palabras. */
function loadDiff(p: PlotRow) {
  if (p.total === 0) return "—";
  if (Math.abs(p.diffUa) < 0.5) return t("ui.herd.loadOk");
  return p.diffUa > 0 ? t("ui.herd.loadSurplus", { n: dec.format(p.diffUa) }) : t("ui.herd.loadShortfall", { n: dec.format(-p.diffUa) });
}

function StockRow({ p }: { p: PlotRow }) {
  return (
    <tr>
      <td className="py-2.5 font-medium">{p.name}</td>
      {HERD_CATEGORIES.map((c) => (
        <td key={c} className="num py-2.5 text-right">
          {p.counts[c] || "—"}
        </td>
      ))}
      <td className="num py-2.5 text-right font-medium">{int.format(p.total)}</td>
      <td className={`num py-2.5 text-right ${p.overLimit ? "font-medium text-peligro" : ""}`}>{p.uaPerHa === null ? "—" : dec.format(p.uaPerHa)}</td>
      <td className="num py-2.5 text-right" title={tk(`ui.herd.loadClass_${p.pastureClass}`)}>
        {dec.format(p.recommendedUaPerHa)}
      </td>
      <td className="num py-2.5 text-right text-tinta-2">{loadDiff(p)}</td>
      <td className="num py-2.5 text-right text-tinta-2">{p.lastCountAt ? fmtDay(p.lastCountAt) : t("ui.herd.neverCounted")}</td>
    </tr>
  );
}

/** Una fila por potrero con sus cabezas por categoría. */
export function StockTable({ plots }: { plots: PlotRow[] }) {
  const head = "pb-2 text-right font-medium";
  return (
    <div className="overflow-x-auto">
      <ExportableTable name="hacienda">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-tinta-2">
              <th className="pb-2 font-medium">{t("ui.common.plot")}</th>
              {HERD_CATEGORIES.map((c) => (
                <th key={c} className={head}>
                  {tk(`fields.herd.${c}`)}
                </th>
              ))}
              <th className={head}>{t("ui.herd.total")}</th>
              <th className={head}>{t("ui.herd.uaPerHaHead")}</th>
              <th className={head}>{t("ui.herd.loadRecommended")}</th>
              <th className={head}>{t("ui.herd.loadDiff")}</th>
              <th className={head}>{t("ui.herd.lastCount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea border-t border-linea">
            {plots.map((p) => (
              <StockRow key={p.plotId} p={p} />
            ))}
          </tbody>
        </table>
      </ExportableTable>
    </div>
  );
}
