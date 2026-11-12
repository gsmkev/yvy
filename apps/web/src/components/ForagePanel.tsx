/** Oferta de forraje estimada (G-05): kg de materia seca por hectárea y días de pasto. */
import { useQuery } from "@tanstack/react-query";
import type { ForageResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

const int = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

export function ForagePanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["forage", farmId],
    queryFn: () => get<ForageResponse>(`/org/farms/${farmId}/forage`),
  });
  if (q.isLoading) return <Spinner rows={4} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  if (!d.plots.length) return <Empty title={t("ui.herdNoPaddocks")}>{t("ui.herdNoPaddocksHint")}</Empty>;
  const c = d.coefficients;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <ExportableTable name="forraje">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta-2">
                <th className="pb-2 font-medium">{t("ui.plot")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.forageHeight")}</th>
                <th className="pb-2 text-right font-medium">NDVI</th>
                <th className="pb-2 text-right font-medium">{t("ui.forageKgHa")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.forageUsable")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.forageDemand")}</th>
                <th className="pb-2 text-right font-medium">{t("ui.forageDays")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea border-t border-linea">
              {d.plots.map((p) => (
                <tr key={p.plotId}>
                  <td className="py-2.5 font-medium">{p.name}</td>
                  <td className="num py-2.5 text-right">
                    {p.heightCm === null ? "—" : `${p.heightCm} cm · ${tk(`fields.level_${p.cover}`).toLowerCase()}`}
                    {p.heightAt ? <span className="block text-xs text-tinta-2">{fmtDay(p.heightAt)}</span> : null}
                  </td>
                  <td className="num py-2.5 text-right">
                    {p.ndvi === null ? "—" : dec.format(p.ndvi)}
                    {p.ndviAt ? <span className="block text-xs text-tinta-2">{fmtDay(p.ndviAt)}</span> : null}
                  </td>
                  <td className="num py-2.5 text-right font-medium">
                    {p.kgDmHa === null ? t("ui.forageNoData") : int.format(p.kgDmHa)}
                    {p.method ? <span className="block text-xs font-normal text-tinta-2">{t(`ui.forageMethod_${p.method}`)}</span> : null}
                    {p.stale ? <span className="block text-xs font-normal text-peligro">{t("ui.forageStale")}</span> : null}
                  </td>
                  <td className="num py-2.5 text-right">{p.usableKgDm === null ? "—" : int.format(p.usableKgDm)}</td>
                  <td className="num py-2.5 text-right">{p.demandKgDay ? int.format(p.demandKgDay) : "—"}</td>
                  <td className="num py-2.5 text-right font-medium">{p.daysLeft === null ? "—" : int.format(p.daysLeft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ExportableTable>
      </div>
      <p className="text-xs text-tinta-2">
        {t("ui.forageHint", {
          low: c.kgDmPerHaPerCm.low,
          mid: c.kgDmPerHaPerCm.medium,
          high: c.kgDmPerHaPerCm.high,
          base: dec.format(c.ndviBase),
          slope: int.format(c.ndviSlopeKgDmHa),
          w: Math.round(c.heightWeight * 100),
          win: c.calibrationWindowDays,
          use: Math.round(c.utilization * 100),
          dm: c.dmPerUaDay,
        })}
      </p>
    </div>
  );
}
