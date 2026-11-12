import { CHART } from "@yvy/shared";
import { fmtIsoDate, fmtDate, fmtDay, fmtMm, fmtNum } from "../lib/format";
import { usePhenology, useWaterBalance, useWithdrawal } from "../lib/agri2";
import { t, tk } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { LineChart } from "./charts";
import { ErrorBox, Spinner } from "./ui";

/** Secciones agronómicas de la ficha de un lote de cultivo (agri-p2). Solo para quien edita el campo. */
export function PlotAgro({ plot }: { plot: Plot }) {
  if (plot.kind !== "crop") return null;
  return (
    <>
      <WithdrawalSection plot={plot} />
      <PhenologySection plotId={plot.id} />
      <WaterBalanceSection plotId={plot.id} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{title}</h3>
      {children}
    </div>
  );
}

/** A-04: fenología estimada por grados-día contra el último estado anotado. */
function PhenologySection({ plotId }: { plotId: string }) {
  const q = usePhenology(plotId);
  const d = q.data;
  return (
    <Section title={t("ui.phenoTitle")}>
      {q.isLoading && <Spinner rows={2} h={24} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && d.status !== "ok" && <p className="text-sm text-tinta-2">{t(`ui.phenoStatus_${d.status}` as "ui.phenoStatus_no_crop")}</p>}
      {d && d.status === "ok" && d.gdd !== null && d.estimatedStage && (
        <div className="flex flex-col gap-1.5 text-sm">
          <p>
            {t("ui.phenoEstimated")}: <strong>{tk(`fields.stage_${d.estimatedStage}`)}</strong>
            <span className="num text-tinta-2">
              {" "}
              · {fmtNum(d.gdd)} {t("ui.phenoGdd")}
            </span>
          </p>
          {d.next && (
            <p className="num text-tinta-2">
              {t("ui.phenoNext", { stage: tk(`fields.stage_${d.next.stage}`), gdd: fmtNum(d.next.gddLeft) })}
            </p>
          )}
          <p>
            {t("ui.phenoObserved")}:{" "}
            {d.observed ? (
              <>
                <strong>{tk(`fields.stage_${d.observed.stage}`)}</strong>
                <span className="text-tinta-2"> · {fmtDate(d.observed.at)}</span>
              </>
            ) : (
              <span className="text-tinta-2">{t("ui.phenoNoObserved")}</span>
            )}
          </p>
          {d.comparison && (
            <p className={d.comparison === "on_track" ? "" : "font-medium text-peligro"}>
              {t(`ui.phenoCompare_${d.comparison}` as "ui.phenoCompare_ahead")}
            </p>
          )}
          <p className="num text-xs text-tinta-2">
            {t("ui.phenoSince", { date: d.sowingDate ? fmtIsoDate(d.sowingDate) : "—", base: d.baseC ?? 0 })}
            {d.coverage && d.coverage.days < d.coverage.of * 0.8
              ? ` · ${t("ui.phenoPartial", { days: d.coverage.days, of: d.coverage.of })}`
              : ""}
          </p>
          <p className="text-xs text-tinta-2">{t("ui.phenoNote")}</p>
          <p className="text-xs text-tinta-2">{t("attribution.nasaPower")}</p>
        </div>
      )}
    </Section>
  );
}

/** C-08: lluvia menos consumo del cultivo desde la siembra. */
function WaterBalanceSection({ plotId }: { plotId: string }) {
  const q = useWaterBalance(plotId);
  const d = q.data;
  const b = d?.balance;
  return (
    <Section title={t("ui.waterBalTitle")}>
      {q.isLoading && <Spinner rows={2} h={24} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && !b && <p className="text-sm text-tinta-2">{t(`ui.waterBalStatus_${d.status === "ok" ? "no_data" : d.status}` as "ui.waterBalStatus_no_data")}</p>}
      {b && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="num">
            {t("ui.waterBalTotals", { rain: fmtMm(b.rainMm), etc: fmtMm(b.etcMm), days: b.days })}
          </p>
          <p className="num">
            {t("ui.waterBalBalance")}: <strong>{fmtMm(b.balanceMm)}</strong>
            {b.balance14Mm !== null && (
              <span className="text-tinta-2"> · {t("ui.waterBalLast14", { mm: fmtMm(b.balance14Mm) })}</span>
            )}
          </p>
          {b.risk && (
            <p className={b.risk === "low" ? "" : "font-medium text-peligro"}>
              {t(`ui.waterBalRisk_${b.risk}` as "ui.waterBalRisk_low")}
            </p>
          )}
          <LineChart
            ariaLabel={t("ui.waterBalTitle")}
            yLabel="mm"
            formatX={(x) => fmtDay(x)}
            formatY={(y) => fmtNum(Math.round(y))}
            series={[
              {
                name: t("ui.waterBalCum"),
                color: CHART.primary,
                points: b.series.map((p) => ({ x: Date.parse(`${p.date}T12:00:00Z`), y: p.cumMm })),
              },
            ]}
          />
          <p className="text-xs text-tinta-2">{t("ui.waterBalNote")}</p>
          <p className="text-xs text-tinta-2">
            {t("attribution.chirps")} · {t("attribution.nasaPower")}
          </p>
        </div>
      )}
    </Section>
  );
}

/** A-14: si el lote tiene una carencia vigente, lo primero que se ve en la sección agronómica. */
function WithdrawalSection({ plot }: { plot: Plot }) {
  const q = useWithdrawal(plot.farmId);
  const r = q.data?.restrictions.find((x) => x.plotId === plot.id);
  const v = q.data?.violations.filter((x) => x.plotId === plot.id) ?? [];
  if (!r && v.length === 0) return null;
  return (
    <Section title={t("ui.withdrawalTitle")}>
      {r && (
        <p className="text-sm font-medium text-peligro">
          {t("ui.withdrawalPlot", { date: fmtIsoDate(r.safeFrom), product: r.product, n: r.daysLeft })}
        </p>
      )}
      {v.map((x) => (
        <p key={`${x.harvestedOn}${x.product}`} className="text-sm text-peligro">
          {t("ui.withdrawalViolation", { plot: plot.name, date: fmtIsoDate(x.harvestedOn), product: x.product, safe: fmtIsoDate(x.safeFrom) })}
        </p>
      ))}
    </Section>
  );
}
