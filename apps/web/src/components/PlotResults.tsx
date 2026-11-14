/** Ficha de costo y margen de un lote (E-31): costo, ingreso y margen por hectárea. Solo dueño y administrador (como los montos). */
import { useQuery } from "@tanstack/react-query";
import { get, qs } from "../lib/api";
import { t } from "../lib/i18n";
import { fmtGs } from "../lib/money";
import { useMe } from "../lib/queries";
import type { Plot } from "../lib/types";
import { Spinner, Stat } from "./ui";

interface Row {
  plotId: string | null;
  costPyg: number;
  incomePyg: number;
  marginPyg: number;
  costPerHa: number | null;
  incomePerHa: number | null;
  marginPerHa: number | null;
}

export function PlotResults({ plot }: { plot: Plot }) {
  const me = useMe();
  const allowed = me.data?.role === "owner" || me.data?.role === "admin";
  const q = useQuery({
    enabled: allowed,
    queryKey: ["erp", "plot-results", plot.farmId],
    queryFn: () => get<{ byPlot: Row[] }>(`/org/erp/results${qs({ farmId: plot.farmId })}`),
  });
  if (!allowed) return null;
  const r = q.data?.byPlot.find((x) => x.plotId === plot.id);
  // Sin costos ni ventas cargados en el lote, la sección no aplica
  if (!q.isLoading && !r) return null;
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-2">{t("ui.plotResultsTitle")}</h3>
      {q.isLoading || !r ? (
        <Spinner rows={2} h={24} />
      ) : (
        <div className="flex flex-wrap gap-6">
          {r.costPerHa !== null && <Stat label={t("ui.resultsCostPerHa")} value={fmtGs(r.costPerHa)} />}
          {r.incomePerHa !== null && <Stat label={t("ui.resultsIncomePerHa")} value={fmtGs(r.incomePerHa)} />}
          <Stat label={t("ui.resultsMargin")} value={fmtGs(r.marginPyg)} tone={r.marginPyg < 0 ? "danger" : undefined} />
        </div>
      )}
    </div>
  );
}
