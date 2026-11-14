import { CHART, IRRIGATION_METHODS, LIMITS, localDate, newId, noonAsuncion, RECORD_SCHEMA_VERSION, type PushResponse } from "@yvy/shared";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fmtIsoDate, fmtDate, fmtDay, fmtMm, fmtNum, fmtTemp } from "../lib/format";
import { usePhenology, usePlotForecast, useWaterBalance, useWithdrawal } from "../lib/agri2";
import { t, tk } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { LineChart } from "./charts";
import { DamageReportModal } from "./DamageReportModal";
import { YieldVigorSection } from "./YieldVigorSection";
import { YieldMapSection } from "./YieldMapSection";
import { ZonesSection } from "./ZonesSection";
import { post } from "../lib/api";
import { Button, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "./ui";

/** Secciones agronómicas de la ficha de un lote de cultivo (agri-p2). Solo para quien edita el campo. */
export function PlotAgro({ plot }: { plot: Plot }) {
  if (plot.kind !== "crop") return null;
  return (
    <>
      <WithdrawalSection plot={plot} />
      <PlotForecastSection plot={plot} />
      <PhenologySection plotId={plot.id} />
      <WaterBalanceSection plot={plot} />
      <ZonesSection plot={plot} />
      <YieldMapSection plot={plot} />
      <YieldVigorSection plot={plot} />
      <DamageSection plot={plot} />
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
  // Sin referencia ni temperaturas no hay nada que la persona pueda hacer: la sección no aplica
  if (d && (d.status === "no_reference" || d.status === "no_data")) return null;
  return (
    <Section title={t("ui.phenoTitle")}>
      {q.isLoading && <Spinner rows={2} h={24} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && (d.status === "no_crop" || d.status === "no_sowing_date") && (
        <p className="text-sm text-tinta-2">{t(`ui.phenoStatus_${d.status}` as "ui.phenoStatus_no_crop")}</p>
      )}
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
function WaterBalanceSection({ plot }: { plot: Plot }) {
  const plotId = plot.id;
  const [irrigating, setIrrigating] = useState(false);
  const q = useWaterBalance(plotId);
  const d = q.data;
  const b = d?.balance;
  return (
    <Section title={t("ui.waterBalTitle")}>
      {q.isLoading && <Spinner rows={2} h={24} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && (
        <div className="mb-2">
          <Button onClick={() => setIrrigating(true)}>{t("ui.waterBalIrrigate")}</Button>
        </div>
      )}
      {irrigating && <IrrigationModal plot={plot} onClose={() => setIrrigating(false)} />}
      {d && !b && (d.status === "no_crop" || d.status === "no_sowing_date") && (
        <p className="text-sm text-tinta-2">{t(`ui.waterBalStatus_${d.status}` as "ui.waterBalStatus_no_crop")}</p>
      )}
      {b && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="num">
            {b.etMissingDays === b.days
              ? t("ui.waterBalTotalsNoEt", { rain: fmtMm(b.rainMm), irr: fmtMm(b.irrigationMm), days: b.days })
              : b.irrigationMm > 0
                ? t("ui.waterBalTotalsIrr", { rain: fmtMm(b.rainMm), irr: fmtMm(b.irrigationMm), etc: fmtMm(b.etcMm), days: b.days })
                : t("ui.waterBalTotals", { rain: fmtMm(b.rainMm), etc: fmtMm(b.etcMm), days: b.days })}
          </p>
          {b.etMissingDays > 0 && <p className="text-xs text-tinta-2">{t("ui.waterBalNoEt", { n: b.etMissingDays })}</p>}
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
              ...(b.irrigationMm > 0
                ? [
                    {
                      name: t("ui.waterBalIrrCum"),
                      color: CHART.comparison,
                      points: b.series.map((p, i) => ({ x: Date.parse(`${p.date}T12:00:00Z`), y: b.series.slice(0, i + 1).reduce((a, x) => a + x.irrigationMm, 0) })),
                    },
                  ]
                : []),
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

/** C-03: pronóstico propio del lote (solo estancias de más de 2.000 ha). */
function PlotForecastSection({ plot }: { plot: Plot }) {
  const q = usePlotForecast(plot.farmId);
  const f = q.data?.plots.find((p) => p.plotId === plot.id);
  if (!f) return null;
  return (
    <Section title={t("ui.plotFcTitle")}>
      <ul className="divide-y divide-linea border-y border-linea text-sm">
        {f.days.slice(0, 7).map((d) => (
          <li key={d.date} className="num flex items-baseline justify-between gap-3 py-2">
            <span>{fmtIsoDate(d.date)}</span>
            <span className="text-tinta-2">
              {d.tminC !== null && d.tmaxC !== null ? `${fmtTemp(d.tminC)} / ${fmtTemp(d.tmaxC)}` : "—"}
              {d.precipMm !== null ? ` · ${fmtMm(d.precipMm)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-tinta-2">
        {t("ui.plotFcNote", { date: fmtDate(f.runAt) })} {t("attribution.metNorway")}
      </p>
    </Section>
  );
}

/** C-09: informe de daños para el seguro agrícola. */
function DamageSection({ plot }: { plot: Plot }) {
  const [open, setOpen] = useState(false);
  return (
    <Section title={t("ui.damageTitle")}>
      <Button onClick={() => setOpen(true)}>{t("ui.damageOpen")}</Button>
      {open && <DamageReportModal plot={plot} onClose={() => setOpen(false)} />}
    </Section>
  );
}

/** A-43: anota un riego del lote desde la web (el mismo registro `irrigation` que carga la app). */
function IrrigationModal({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ mm: "", method: "pivot", date: localDate(Date.now()) });
  const save = useMutation({
    mutationFn: async () => {
      const at = Math.min(noonAsuncion(f.date), Date.now() - 1000);
      const res = await post<PushResponse>("/sync/push", {
        deviceId: "web",
        mutations: [
          {
            mutationId: newId(),
            kind: "records.upsert",
            row: {
              id: newId(),
              farmId: plot.farmId,
              plotId: plot.id,
              poiId: null,
              kind: "irrigation",
              data: { mm: Number(f.mm), method: f.method, appliedAt: at },
              schemaVersion: RECORD_SCHEMA_VERSION,
              lon: null,
              lat: null,
              gpsAccuracyM: null,
              capturedAt: at,
            },
          },
        ],
      });
      const r = res.results[0];
      if (r?.status === "rejected") throw new Error(r.detail ?? t("ui.fuelRejected"));
    },
    onSuccess: () => {
      toast(t("ui.waterBalIrrigateSaved"));
      qc.invalidateQueries({ queryKey: ["water-balance", plot.id] });
      qc.invalidateQueries({ queryKey: ["records"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.waterBalIrrigate")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("fields.irrigationMm")}>
          <Input type="number" required min={0.1} max={LIMITS.irrigation.maxMm} step="any" value={f.mm} onChange={(e) => setF({ ...f, mm: e.target.value })} />
        </Field>
        <Field label={t("fields.irrigationDate")}>
          <Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label={t("fields.irrigationMethod")}>
            <Select
              value={f.method}
              onChange={(e) => setF({ ...f, method: e.target.value })}
              options={IRRIGATION_METHODS.map((m) => ({ value: m, label: t(`fields.irrigationMethod_${m}` as "fields.irrigationMethod_pivot") }))}
            />
          </Field>
        </div>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
