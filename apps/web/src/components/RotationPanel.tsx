/** Rotación de potreros (G-04): ocupación, descanso y próximo potrero sugerido. */
import { useQuery } from "@tanstack/react-query";
import type { RotationResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

const dec = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const days = (v: number | null) => (v === null ? "—" : dec.format(v));

export function RotationPanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["rotation", farmId],
    queryFn: () => get<RotationResponse>(`/org/farms/${farmId}/rotation`),
  });
  if (q.isLoading) return <Spinner rows={4} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  if (!d.plots.length) return <Empty title={t("ui.herdNoPaddocks")}>{t("ui.herdNoPaddocksHint")}</Empty>;
  return (
    <div className="flex flex-col gap-4">
      {d.suggested ? (
        <p role="status" className="text-sm font-medium">
          {t("ui.rotSuggested", { name: d.suggested.name })}
          <span className="font-normal text-tinta-2">
            {" "}
            {d.suggested.restDays === null ? t("ui.rotNoHistory") : t("ui.rotRestedDays", { n: days(d.suggested.restDays) })}
            {d.suggested.pastureReady === true ? ` · ${t("ui.rotPastureOk")}` : ""}
            {d.suggested.pastureReady === null ? ` · ${t("ui.rotPastureUnknown")}` : ""}
          </span>
        </p>
      ) : (
        <p className="text-sm text-tinta-2">{t("ui.rotNoneReady")}</p>
      )}
      {d.truncated && <p className="text-sm text-tinta-2">{t("ui.herdTruncated")}</p>}
      <div className="overflow-x-auto">
        <ExportableTable name="rotacion">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-2">
                <th className="pb-2 font-medium">{t("ui.plot")}</th>
                <th className="pb-2 font-medium">{t("ui.rotState")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.herdTotal")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.rotStay")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.rotRest")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.rotYear")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.rotPasture")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea border-t border-linea">
              {d.plots.map((p) => (
                <tr key={p.plotId}>
                  <td className="py-2.5 font-medium">{p.name}</td>
                  <td className={`py-2.5 ${p.state === "overdue" ? "font-medium text-peligro" : ""}`}>
                    {tk(`ui.rotState_${p.state}`)}
                    {d.suggested?.plotId === p.plotId ? ` · ${t("ui.rotNext")}` : ""}
                  </td>
                  <td className="num py-2.5 text-right">{p.head || "—"}</td>
                  <td className="num py-2.5 text-right">{days(p.stayDays)}</td>
                  <td className="num py-2.5 text-right">{days(p.restDays)}</td>
                  <td className="num py-2.5 text-right">{days(p.occupiedDays)}</td>
                  <td className="num py-2.5 text-right text-tinta-2">
                    {p.pasture ? `${p.pasture.heightCm} cm · ${tk(`fields.level_${p.pasture.cover}`).toLowerCase()} · ${fmtDay(p.pasture.at)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ExportableTable>
      </div>
      <p className="text-xs text-tinta-2">
        {t("ui.rotHint", {
          rest: d.defaults.minRestDays,
          max: d.defaults.maxOccupancyDays,
          height: d.defaults.minEntryHeightCm,
        })}
      </p>
    </div>
  );
}
