/**
 * Secciones de la ficha del lote para roles de oficina (ola 2: funciones 44, 45, 47, 49 a 52, 36 y 39).
 * Cada una se oculta si no tiene nada que decir: la ficha nunca muestra secciones vacías.
 */
import { View } from "react-native";
import { CHART, CROPS, PLOT_KINDS, SEASONS, t, type MessageKey } from "@yvy/shared";
import type { Plot } from "../db/store";
import { fmtNumber } from "../office/format";
import { useOnline } from "../office/useOnline";
import { DateField, FormSheet, KeyValue, LineChart, SelectField, Segmented, StatRow, TextField } from "../office/ui";
import { cToTemp, mmToRain, rainLabel, type Units } from "../lib/unitsLogic";
import { daysSince, vigorTrend } from "../lib/plotSheet";
import { deltaVsFarm, fmtRain, fmtTemp, ndviColor, type RotationRow, type VigorPoint } from "../lib/plotInfo";
import { Button, Row, SectionHeader, Text } from "./kit";
import { C, T } from "./theme";

const k = (s: string) => s as MessageKey;
const num2 = (v: number) => fmtNumber(v, 2);
const dayShort = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" }).replace(".", "");
const isoShort = (iso: string) => dayShort(Date.parse(`${iso}T12:00:00-03:00`));
const isoFull = (iso: string) => iso.split("-").reverse().join("/");

// ---------- Vigor (44 y 45) ----------

/** Vigor actual, comparación con la estancia, aviso de baja confianza y curva en el tiempo. Null si no hay pasadas. */
export function VigorSection({ history, farmMeans, plotName }: { history: VigorPoint[]; farmMeans: number[]; plotName: string }) {
  const cur = history[history.length - 1];
  if (!cur) return null;
  const prev = history.length > 1 ? history[history.length - 2]! : null;
  const trend = vigorTrend(cur, prev);
  const delta = deltaVsFarm(cur.mean, farmMeans);
  const stats = [
    { label: t("ui.ndviCurrent"), value: num2(cur.mean) },
    ...(delta === null ? [] : [{ label: t("ui.farmAverage"), value: Math.abs(delta) < 0.5 ? t("ui.sameAsFarm") : `${delta > 0 ? "+" : ""}${fmtNumber(delta, 1)} %`, tone: delta < -5 ? ("danger" as const) : undefined }]),
  ];
  const sub = [
    t("app.plotVigor", { value: num2(cur.mean), date: dayShort(cur.acquiredAt) }),
    trend.kind === "down" ? t("app.plotSheetVigorDown", { pct: Math.round(trend.pct) }) : trend.kind === "up" ? t("app.plotSheetVigorUp", { pct: Math.round(trend.pct) }) : trend.kind === "flat" ? t("app.plotSheetVigorFlat") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <SectionHeader title={t("app.plotSheetVigor")} />
      <StatRow items={stats} />
      <Text style={[T.small, { marginTop: 8 }]}>{sub}</Text>
      {cur.lowConfidence ? (
        <View accessibilityRole="alert" style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.atencionSuave }}>
          <Text style={[T.small, { color: C.atencion }]}>
            <Text style={[T.smallMedium, { color: C.atencion }]}>{t("ui.lowConfidence")}. </Text>
            {t("ui.lowConfidenceNote")}
          </Text>
        </View>
      ) : null}
      {history.length > 1 ? (
        <>
          <SectionHeader title={t("ui.ndviCurve")} />
          <LineChart height={180} series={[{ label: plotName, color: ndviColor(cur.mean), points: history.map((p) => ({ x: dayShort(p.acquiredAt), y: p.mean })) }]} />
          <Text style={[T.small, { marginTop: 4 }]}>{t("attribution.copernicus")}</Text>
        </>
      ) : null}
    </>
  );
}

// ---------- Campañas del lote (47) ----------

interface HistoryApiRow extends RotationRow {
  startDate: string | null;
  sowingDensity: number | null;
  densityUnit: string | null;
}

/** Historial y rotación. Con señal (o caché) trae el rinde del servidor; sin nada, lo planificado que ya está en el celular. */
export function RotationSection({ plotId, local }: { plotId: string; local: RotationRow[] }) {
  const q = useOnline<HistoryApiRow[]>(`/org/plots/${plotId}/seasons`);
  const rows: RotationRow[] = q.data && q.data.length > 0 ? q.data : local;
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader title={t("ui.rotationTitle")} />
      {rows.map((r) => {
        const sown = r.sownOn ? t("ui.rotationSown", { date: dayShort(r.sownOn) }) : r.plannedSowingDate ? t("ui.rotationPlanned", { date: isoFull(r.plannedSowingDate) }) : null;
        const yieldLine = r.yieldTHa !== null ? `${t("ui.yieldPerHa")}: ${fmtNumber(r.yieldTHa, 1)} t/ha${r.harvestTons !== null ? ` · ${t("ui.rotationHarvest", { tons: fmtNumber(r.harvestTons, 1) })}` : ""}` : null;
        const target = r.targetYieldTHa !== null ? (r.yieldTHa !== null ? t("ui.yieldVsTarget", { n: fmtNumber(r.targetYieldTHa, 1) }) : `${t("ui.seasonTargetYield").replace(" (t/ha)", "")}: ${fmtNumber(r.targetYieldTHa, 1)} t/ha`) : null;
        return <Row key={r.seasonId} title={`${r.seasonName} · ${r.crop ? t(k(`fields.crop_${r.crop}`)) : "—"}`} subtitle={[yieldLine, target, r.variety, sown].filter(Boolean).join(" · ") || undefined} />;
      })}
    </>
  );
}

// ---------- Carencia, fenología, balance hídrico y pronóstico (49 a 52) ----------

interface Withdrawal {
  restrictions: { plotId: string; safeFrom: string; daysLeft: number; product: string }[];
  violations: { plotId: string; harvestedOn: string; safeFrom: string; product: string }[];
}

export function WithdrawalSection({ plot }: { plot: Plot }) {
  const q = useOnline<Withdrawal>(`/org/farms/${plot.farmId}/withdrawal`);
  const r = q.data?.restrictions.find((x) => x.plotId === plot.id);
  const v = q.data?.violations.filter((x) => x.plotId === plot.id) ?? [];
  if (!r && v.length === 0) return null;
  return (
    <>
      <SectionHeader title={t("ui.withdrawalTitle")} />
      {r ? <Row tone="danger" title={t("ui.withdrawalUntil", { date: isoFull(r.safeFrom) })} subtitle={`${r.product} · ${r.daysLeft === 1 ? t("ui.withdrawalDayOne") : t("ui.withdrawalDays", { n: r.daysLeft })}`} /> : null}
      {v.map((x) => (
        <Row key={`${x.harvestedOn}${x.product}`} tone="danger" title={t("ui.withdrawalViolation", { plot: plot.name, date: isoFull(x.harvestedOn), product: x.product, safe: isoFull(x.safeFrom) })} />
      ))}
    </>
  );
}

interface Phenology {
  status: "ok" | "no_crop" | "no_reference" | "no_sowing_date" | "no_data";
  sowingDate: string | null;
  baseC: number | null;
  gdd: number | null;
  coverage: { days: number; of: number } | null;
  estimatedStage: string | null;
  next: { stage: string; gddLeft: number } | null;
  observed: { stage: string; at: number } | null;
  comparison: "ahead" | "on_track" | "behind" | null;
}

export function PhenologySection({ plotId }: { plotId: string }) {
  const q = useOnline<Phenology>(`/org/plots/${plotId}/phenology`);
  const d = q.data;
  if (!d) return null;
  if (d.status !== "ok" || d.gdd === null || !d.estimatedStage)
    return (
      <>
        <SectionHeader title={t("ui.phenoTitle")} />
        <Text style={T.small}>{t(k(`ui.phenoStatus_${d.status === "ok" ? "no_data" : d.status}`))}</Text>
      </>
    );
  const rows = [
    { label: t("ui.phenoEstimated"), value: t(k(`fields.stage_${d.estimatedStage}`)) },
    { label: t("ui.phenoObserved"), value: d.observed ? `${t(k(`fields.stage_${d.observed.stage}`))} · ${dayShort(d.observed.at)}` : t("ui.phenoNoObserved") },
  ];
  return (
    <>
      <SectionHeader title={t("ui.phenoTitle")} />
      <KeyValue rows={rows} />
      {d.next ? <Text style={[T.small, { marginTop: 8 }]}>{t("ui.phenoNext", { stage: t(k(`fields.stage_${d.next.stage}`)), gdd: fmtNumber(d.next.gddLeft, 0) })}</Text> : null}
      {d.comparison ? <Text style={[T.bodyMedium, { marginTop: 8 }, d.comparison !== "on_track" && { color: C.peligro }]}>{t(k(`ui.phenoCompare_${d.comparison}`))}</Text> : null}
      <Text style={[T.small, { marginTop: 8 }]}>
        {t("ui.phenoSince", { date: d.sowingDate ? isoFull(d.sowingDate) : "—", base: d.baseC ?? 0 })}
        {d.coverage && d.coverage.days < d.coverage.of * 0.8 ? ` · ${t("ui.phenoPartial", { days: d.coverage.days, of: d.coverage.of })}` : ""}
      </Text>
      <Text style={[T.small, { marginTop: 4 }]}>{t("attribution.nasaPower")}</Text>
    </>
  );
}

interface WaterBalance {
  status: "ok" | "no_crop" | "no_reference" | "no_sowing_date" | "no_data";
  balance: {
    days: number;
    rainMm: number;
    irrigationMm: number;
    etcMm: number;
    etMissingDays: number;
    balanceMm: number;
    balance14Mm: number | null;
    risk: "low" | "medium" | "high" | null;
    series: { date: string; irrigationMm: number; cumMm: number }[];
  } | null;
}

export function WaterBalanceSection({ plotId, units, onIrrigate }: { plotId: string; units: Units; onIrrigate: (() => void) | null }) {
  const q = useOnline<WaterBalance>(`/org/plots/${plotId}/water-balance`);
  const d = q.data;
  if (!d) return null;
  const b = d.balance;
  const unit = rainLabel(units.rain);
  const conv = (mm: number) => Math.round(mmToRain(mm, units.rain) * 100) / 100;
  const irrigate = onIrrigate ? <Button kind="secondary" title={t("ui.waterBalIrrigate")} onPress={onIrrigate} style={{ marginTop: 12 }} /> : null;
  if (!b)
    return (
      <>
        <SectionHeader title={t("ui.waterBalTitle")} />
        <Text style={T.small}>{t(k(`ui.waterBalStatus_${d.status === "ok" ? "no_data" : d.status}`))}</Text>
        {irrigate}
      </>
    );
  const totals =
    b.etMissingDays === b.days
      ? t("ui.waterBalTotalsNoEt", { rain: fmtRain(b.rainMm, units), irr: fmtRain(b.irrigationMm, units), days: b.days })
      : b.irrigationMm > 0
        ? t("ui.waterBalTotalsIrr", { rain: fmtRain(b.rainMm, units), irr: fmtRain(b.irrigationMm, units), etc: fmtRain(b.etcMm, units), days: b.days })
        : t("ui.waterBalTotals", { rain: fmtRain(b.rainMm, units), etc: fmtRain(b.etcMm, units), days: b.days });
  return (
    <>
      <SectionHeader title={t("ui.waterBalTitle")} />
      <StatRow items={[{ label: t("ui.waterBalBalance"), value: fmtNumber(mmToRain(b.balanceMm, units.rain), units.rain === "in" ? 2 : 0), unit, tone: b.risk && b.risk !== "low" ? "danger" : undefined }, ...(b.balance14Mm !== null ? [{ label: t("office.plotWaterLast14"), value: fmtNumber(mmToRain(b.balance14Mm, units.rain), units.rain === "in" ? 2 : 0), unit }] : [])]} />
      <Text style={[T.small, { marginTop: 8 }]}>{totals}</Text>
      {b.etMissingDays > 0 ? <Text style={[T.small, { marginTop: 4 }]}>{t("ui.waterBalNoEt", { n: b.etMissingDays })}</Text> : null}
      {b.risk ? <Text style={[T.bodyMedium, { marginTop: 8 }, b.risk !== "low" && { color: C.peligro }]}>{t(k(`ui.waterBalRisk_${b.risk}`))}</Text> : null}
      {b.series.length > 1 ? (
        <LineChart
          height={180}
          yUnit={unit}
          series={[
            { label: t("ui.waterBalCum").replace("(mm)", `(${unit})`), color: CHART.primary, points: b.series.map((p) => ({ x: isoShort(p.date), y: conv(p.cumMm) })) },
            ...(b.irrigationMm > 0
              ? [{ label: t("ui.waterBalIrrCum").replace("(mm)", `(${unit})`), color: CHART.comparison, points: b.series.map((p, i) => ({ x: isoShort(p.date), y: conv(b.series.slice(0, i + 1).reduce((a, x) => a + x.irrigationMm, 0)) })) }]
              : []),
          ]}
        />
      ) : null}
      {irrigate}
      <Text style={[T.small, { marginTop: 8 }]}>{t("ui.waterBalNote")}</Text>
      <Text style={[T.small, { marginTop: 4 }]}>
        {t("attribution.chirps")} · {t("attribution.nasaPower")}
      </Text>
    </>
  );
}

interface PlotForecast {
  plots: { plotId: string; runAt: number; days: { date: string; tminC: number | null; tmaxC: number | null; precipMm: number | null }[] }[];
}

/** Pronóstico propio del lote; el servidor lo calcula solo para estancias grandes, así que casi siempre no hay nada que mostrar. */
export function ForecastSection({ plot, units }: { plot: Plot; units: Units }) {
  const q = useOnline<PlotForecast>(`/org/farms/${plot.farmId}/plot-forecast`, { ttlMs: 10 * 60_000 });
  const f = q.data?.plots.find((p) => p.plotId === plot.id);
  if (!f || f.days.length === 0) return null;
  return (
    <>
      <SectionHeader title={t("ui.plotFcTitle")} />
      <KeyValue
        rows={f.days.slice(0, 7).map((d) => ({
          label: isoShort(d.date),
          value: [d.tminC !== null && d.tmaxC !== null ? `${fmtNumber(cToTemp(d.tminC, units.temp), 0)} / ${fmtTemp(d.tmaxC, units)}` : null, d.precipMm !== null ? fmtRain(d.precipMm, units) : null].filter(Boolean).join(" · ") || "—",
        }))}
      />
      <Text style={[T.small, { marginTop: 8 }]}>
        {t("ui.plotFcNote", { date: dayShort(f.runAt) })} {t("attribution.metNorway")}
      </Text>
    </>
  );
}

// ---------- Editar atributos (36) ----------

export interface PlotEdit {
  name: string;
  kind: "crop" | "pasture";
  crop: string;
  season: string;
  sowingDate: string;
  pastureType: string;
}

export const editFromPlot = (p: Plot): PlotEdit => ({ name: p.name, kind: p.kind, crop: p.crop ?? "", season: p.season ?? "", sowingDate: p.sowingDate ?? "", pastureType: p.pastureType ?? "" });

/** Hoja de edición de los atributos del lote. */
export function EditPlotSheet({ visible, draft, onChange, onClose, onSubmit, pending, error }: { visible: boolean; draft: PlotEdit; onChange: (patch: Partial<PlotEdit>) => void; onClose: () => void; onSubmit: () => void; pending: boolean; error: string | null }) {
  return (
    <FormSheet visible={visible} title={t("office.plotEditTitle")} onClose={onClose} onSubmit={onSubmit} submitLabel={t("ui.save")} pending={pending} error={error}>
      <TextField label={t("app.plotDrawName")} value={draft.name} onChangeText={(v) => onChange({ name: v })} maxLength={120} />
      <View style={{ marginTop: 16 }}>
        <Segmented value={draft.kind} onChange={(v) => onChange({ kind: v })} options={PLOT_KINDS.map((x) => ({ value: x, label: x === "crop" ? t("ui.crop") : t("ui.pasture") }))} />
      </View>
      {draft.kind === "crop" ? (
        <>
          <SelectField label={t("ui.crop")} value={draft.crop} options={[{ value: "", label: t("ui.none") }, ...CROPS.map((c) => ({ value: c as string, label: t(k(`fields.crop_${c}`)) }))]} onChange={(v) => onChange({ crop: v })} />
          <SelectField label={t("ui.season")} value={draft.season} options={[{ value: "", label: t("ui.none") }, ...SEASONS.map((c) => ({ value: c as string, label: t(k(`office.plotSeason_${c}`)) }))]} onChange={(v) => onChange({ season: v })} />
          <DateField label={t("ui.sowingDate")} value={draft.sowingDate} onChange={(v) => onChange({ sowingDate: v })} />
        </>
      ) : (
        <TextField label={t("ui.pastureType")} value={draft.pastureType} onChangeText={(v) => onChange({ pastureType: v })} maxLength={60} />
      )}
    </FormSheet>
  );
}

/** Días sin visitar en palabras ("hoy", "ayer", "hace 9 días"). */
export function visitText(lastVisit: number | null): string {
  if (lastVisit === null) return t("app.noVisits");
  const d = daysSince(lastVisit);
  return d === 0 ? t("app.lastVisitToday") : d === 1 ? t("app.lastVisitYesterday") : t("app.lastVisit", { days: d });
}
