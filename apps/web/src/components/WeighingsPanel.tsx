/** Pesadas y ganancia diaria de peso por lote de animales y por animal con caravana. */
import { useQuery } from "@tanstack/react-query";
import type { WeighingsResponse, WeightSeries } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t } from "../lib/i18n";
import { DataTable, Empty, ErrorBox, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

const dec1 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ganancia diaria de peso en kg, o "—" si no hay dato. */
export const adgText = (v: number | null) => (v === null ? "—" : `${dec2.format(v)} kg`);

function SeriesTable({ rows, firstHeader }: { rows: WeightSeries[]; firstHeader: string }) {
  return (
    <ExportableTable name="pesadas">
      <DataTable<WeightSeries>
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          { id: "label", header: firstHeader, cell: (r) => <span className="font-medium">{r.label ?? t("ui.weigh.noGroup")}</span> },
          { id: "count", header: t("ui.weigh.count"), align: "right", cell: (r) => r.points.length },
          { id: "first", header: t("ui.weigh.first"), align: "right", cell: (r) => (r.firstKg === null ? "—" : `${dec1.format(r.firstKg)} kg · ${fmtDay(r.firstAt!)}`) },
          { id: "last", header: t("ui.weigh.last"), align: "right", cell: (r) => (r.lastKg === null ? "—" : `${dec1.format(r.lastKg)} kg · ${fmtDay(r.lastAt!)}`) },
          { id: "days", header: t("ui.weigh.days"), align: "right", cell: (r) => (r.days === null ? "—" : dec1.format(r.days)) },
          { id: "adg", header: t("ui.weigh.adg"), align: "right", cell: (r) => <span className="font-medium">{adgText(r.adgKg)}</span> },
          { id: "recent", header: t("ui.weigh.adgRecent"), align: "right", cell: (r) => <span className="text-tinta-2">{adgText(r.lastAdgKg)}</span> },
        ]}
      />
    </ExportableTable>
  );
}

/** Pesadas y ganancia diaria de peso de una estancia. */
export function WeighingsPanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["weighings", farmId],
    queryFn: () => get<WeighingsResponse>(`/org/farms/${farmId}/weighings`),
  });
  if (q.isLoading) return <Spinner rows={3} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  if (!d.groups.length && !d.animals.length) return <Empty title={t("ui.weigh.none")}>{t("ui.weigh.noneHint")}</Empty>;
  return (
    <div className="flex flex-col gap-6">
      {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herd.truncated")}</p>}
      {d.groups.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("ui.weigh.groups")}</h3>
          <SeriesTable rows={d.groups} firstHeader={t("fields.common.group")} />
        </section>
      )}
      {d.animals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("ui.weigh.animals")}</h3>
          <SeriesTable rows={d.animals} firstHeader={t("fields.common.tag")} />
        </section>
      )}
      <p className="text-xs text-tinta-2">{t("ui.weigh.hint")}</p>
    </div>
  );
}
