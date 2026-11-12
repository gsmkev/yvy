/** R-08: vigor y lluvia de la estancia frente a la mediana anónima de las estancias vecinas de otras organizaciones. */
import { useQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import { compareToZone } from "../lib/benchmark";
import { fmtDate, fmtMm, fmtNdvi } from "../lib/format";
import { t, tk } from "../lib/i18n";

interface Benchmark {
  computedAt: number;
  radiusKm: number;
  windowDays: number;
  nFarms: number;
  ndvi: number | null;
  ndviMedian: number | null;
  rainMm: number | null;
  rainMedianMm: number | null;
}

export function ZoneBenchmark({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["zone-benchmark", farmId],
    queryFn: () => get<Benchmark | null>(`/org/farms/${farmId}/zone-benchmark`),
    staleTime: 60 * 60_000,
  });
  const b = q.data;
  // Sin al menos 3 estancias ajenas cerca no hay comparación posible: la sección no aparece
  if (!b) return null;
  const rows = [
    { key: "Vigor", own: b.ndvi, med: b.ndviMedian, fmt: fmtNdvi },
    { key: "Rain", own: b.rainMm, med: b.rainMedianMm, fmt: fmtMm },
  ] as const;
  return (
    <section aria-labelledby="bench-h" className="flex flex-col gap-2 border-t border-linea pt-5">
      <h3 id="bench-h" className="font-serif text-lg font-semibold">
        {t("ui.benchTitle")}
      </h3>
      <p className="text-sm text-tinta-2">
        {t("ui.benchIntro", { n: b.nFarms, km: b.radiusKm, days: b.windowDays })}
      </p>
      <table className="num w-full text-left text-sm">
        <thead className="text-xs text-tinta-2">
          <tr>
            <th className="py-1 font-medium" />
            <th className="py-1 font-medium">{t("ui.benchYours")}</th>
            <th className="py-1 font-medium">{t("ui.benchZone")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea border-y border-linea">
          {rows.map((r) => (
            <tr key={r.key}>
              <th className="py-2 font-normal">{t(r.key === "Vigor" ? "ui.benchVigor" : "ui.benchRain")}</th>
              <td className="py-2">{r.own === null ? <span className="text-tinta-2">{t("ui.benchNoOwn")}</span> : r.fmt(r.own)}</td>
              <td className="py-2">
                {r.med === null ? <span className="text-tinta-2">{t("ui.benchNoMedian")}</span> : r.fmt(r.med)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-0.5 text-sm">
        {rows.map((r) => {
          const v = compareToZone(r.own, r.med);
          return v ? <li key={r.key}>{tk(`ui.bench${r.key}${v[0]!.toUpperCase()}${v.slice(1)}`)}</li> : null;
        })}
      </ul>
      <p className="text-xs text-tinta-2">{t("ui.benchDate", { date: fmtDate(b.computedAt) })}</p>
    </section>
  );
}
