/** Pesadas y ganancia diaria de peso (G-22) por lote de animales y por animal con caravana. */
import { useQuery } from "@tanstack/react-query";
import type { WeighingsResponse, WeightSeries } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t } from "../lib/i18n";
import { Empty, ErrorBox, Spinner } from "./ui";

const dec1 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const adgText = (v: number | null) => (v === null ? "—" : `${dec2.format(v)} kg`);

function SeriesTable({ rows, firstHeader }: { rows: WeightSeries[]; firstHeader: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-tinta-2">
            <th className="pb-2 font-medium">{firstHeader}</th>
            <th className="pb-2 text-right font-medium">{t("ui.weighCount")}</th>
            <th className="pb-2 text-right font-medium">{t("ui.weighFirst")}</th>
            <th className="pb-2 text-right font-medium">{t("ui.weighLast")}</th>
            <th className="pb-2 text-right font-medium">{t("ui.weighDays")}</th>
            <th className="pb-2 text-right font-medium">{t("ui.weighAdg")}</th>
            <th className="pb-2 text-right font-medium">{t("ui.weighAdgRecent")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea border-t border-linea">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2.5 font-medium">{r.label ?? t("ui.weighNoGroup")}</td>
              <td className="num py-2.5 text-right">{r.points.length}</td>
              <td className="num py-2.5 text-right">{r.firstKg === null ? "—" : `${dec1.format(r.firstKg)} kg · ${fmtDay(r.firstAt!)}`}</td>
              <td className="num py-2.5 text-right">{r.lastKg === null ? "—" : `${dec1.format(r.lastKg)} kg · ${fmtDay(r.lastAt!)}`}</td>
              <td className="num py-2.5 text-right">{r.days === null ? "—" : dec1.format(r.days)}</td>
              <td className="num py-2.5 text-right font-medium">{adgText(r.adgKg)}</td>
              <td className="num py-2.5 text-right text-tinta-2">{adgText(r.lastAdgKg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WeighingsPanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["weighings", farmId],
    queryFn: () => get<WeighingsResponse>(`/org/farms/${farmId}/weighings`),
  });
  if (q.isLoading) return <Spinner rows={3} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  if (!d.groups.length && !d.animals.length) return <Empty title={t("ui.weighNone")}>{t("ui.weighNoneHint")}</Empty>;
  return (
    <div className="flex flex-col gap-6">
      {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
      {d.groups.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("ui.weighGroups")}</h3>
          <SeriesTable rows={d.groups} firstHeader={t("fields.group")} />
        </section>
      )}
      {d.animals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("ui.weighAnimals")}</h3>
          <SeriesTable rows={d.animals} firstHeader={t("fields.tag")} />
        </section>
      )}
      <p className="text-xs text-tinta-2">{t("ui.weighHint")}</p>
    </div>
  );
}
