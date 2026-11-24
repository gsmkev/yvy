/** Oferta de forraje estimada: kg de materia seca por hectárea y días de pasto. */
import { useQuery } from "@tanstack/react-query";
import type { ForageResponse } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDay } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { DataTable, Empty, ErrorBox, Spinner } from "./ui";
import { ExportableTable } from "./ExportableTable";

const int = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

/** Oferta de forraje de los potreros de una estancia. */
export function ForagePanel({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["forage", farmId],
    queryFn: () => get<ForageResponse>(`/org/farms/${farmId}/forage`),
  });
  if (q.isLoading) return <Spinner rows={4} h={48} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  if (!d.plots.length) return <Empty title={t("ui.herd.noPaddocks")}>{t("ui.herd.noPaddocksHint")}</Empty>;
  const c = d.coefficients;
  return (
    <div className="flex flex-col gap-4">
      <ExportableTable name="forraje">
        <DataTable<(typeof d.plots)[number]>
          rows={d.plots}
          rowKey={(p) => p.plotId}
          columns={[
            { id: "name", header: t("ui.common.plot"), cell: (p) => <span className="font-medium">{p.name}</span> },
            {
              id: "height",
              header: t("ui.forage.height"),
              align: "right",
              cell: (p) => (
                <>
                  {p.heightCm === null ? "—" : `${p.heightCm} cm · ${tk(`fields.level.${p.cover}`).toLowerCase()}`}
                  {p.heightAt ? <span className="block text-xs text-tinta-2">{fmtDay(p.heightAt)}</span> : null}
                </>
              ),
            },
            {
              id: "ndvi",
              header: "NDVI",
              align: "right",
              cell: (p) => (
                <>
                  {p.ndvi === null ? "—" : dec.format(p.ndvi)}
                  {p.ndviAt ? <span className="block text-xs text-tinta-2">{fmtDay(p.ndviAt)}</span> : null}
                </>
              ),
            },
            {
              id: "kg",
              header: t("ui.forage.kgHa"),
              align: "right",
              cell: (p) => (
                <span className="font-medium">
                  {p.kgDmHa === null ? t("ui.forage.noData") : int.format(p.kgDmHa)}
                  {p.method ? <span className="block text-xs font-normal text-tinta-2">{t(`ui.forage.method_${p.method}`)}</span> : null}
                  {p.stale ? <span className="block text-xs font-normal text-peligro">{t("ui.forage.stale")}</span> : null}
                </span>
              ),
            },
            { id: "usable", header: t("ui.forage.usable"), align: "right", cell: (p) => (p.usableKgDm === null ? "—" : int.format(p.usableKgDm)) },
            { id: "demand", header: t("ui.forage.demand"), align: "right", cell: (p) => (p.demandKgDay ? int.format(p.demandKgDay) : "—") },
            { id: "days", header: t("ui.forage.days"), align: "right", cell: (p) => <span className="font-medium">{p.daysLeft === null ? "—" : int.format(p.daysLeft)}</span> },
          ]}
        />
      </ExportableTable>
      <p className="text-xs text-tinta-2">
        {t("ui.forage.hint", {
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
