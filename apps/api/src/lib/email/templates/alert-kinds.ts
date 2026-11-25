/**
 * Composición de cada tipo de aviso agronómico: titular, frase, cifras y widgets armados solo con lo que
 * trae el aviso (`details`) y los datos de contexto leídos al enviar. Si falta un dato, ese widget se omite.
 */
import { localDate, localTime, t, tk, type Markup } from "@yvy/shared";
import { C } from "../layout";
import { dm, weekdayLong, weekdayShort } from "../message";
import {
  barChart,
  callout,
  compareBars,
  forecastStrip,
  fmtNum,
  heatStrip,
  legend,
  plotList,
  progress,
  scale,
  sectionTitle,
  sparkline,
  type Kpi,
} from "../widgets";
import { list, num, plotColor, str } from "./data";

/** Pronóstico diario de la estancia. */
export interface DayForecast {
  date: string;
  tmin: number | null;
  tmax: number | null;
  rainMm: number | null;
}
/** Pronóstico horario de la estancia. */
export interface HourForecast {
  at: number;
  tempC: number | null;
  humidityPct: number | null;
}
/** Lote alcanzado por un aviso. */
export interface PlotInfo {
  id: string;
  name: string;
  crop: string | null;
  kind: string;
  areaHa: number;
}

/** Datos de contexto que se leen al enviar un aviso (pronóstico cacheado, lotes, lluvia observada). */
export interface AlertContext {
  now: number;
  days: DayForecast[];
  hours: HourForecast[];
  plots: PlotInfo[];
  /** Lluvia observada de los últimos 30 días, de más vieja a más nueva. */
  rainDaily: { date: string; mm: number }[];
}

/** Entrada de cada compositor. */
export interface Env {
  d: Record<string, unknown>;
  ctx: AlertContext;
  tz: string;
  summary: string;
  /** Fecha de hoy (ISO, hora de la estancia). */
  today: string;
}

/** Lo que arma un compositor; el titular o la frase pueden faltar y se reemplazan por los genéricos. */
export interface Composition {
  headline?: string;
  lead?: string;
  kpis: Kpi[];
  blocks: Markup[];
}

const ha = (n: number) => t("email.alert.plotArea", { ha: fmtNum(n, 1) });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Lotes alcanzados, con punto de color del cultivo. */
function plotsBlock(titleKey: "plots" | "plotsFrost" | "plotsRust" | "plotsPest", plots: PlotInfo[]): Markup[] {
  if (!plots.length) return [];
  const rows = plots.slice(0, 6).map((p) => ({ color: plotColor(p.crop, p.kind), name: p.name, detail: p.crop ?? "", value: ha(p.areaHa) }));
  return [sectionTitle(tk(`email.alert.${titleKey}`)), plotList(rows)];
}

/** Bloque "Qué hacer" de un tipo de aviso (título y tres indicaciones). */
export const todoBlock = (kind: string): Markup => callout(tk(`email.alert.todoTitle_${kind}`), [1, 2, 3].map((n) => tk(`email.alert.todo_${kind}_${n}`)));

/** Día de la semana de una fecha ISO con su pronóstico de lluvia, de hoy en adelante, hasta 7 días. */
const rainDays = (e: Env) =>
  e.ctx.days
    .filter((d) => d.date >= e.today)
    .slice(0, 7)
    .map((d) => ({ date: d.date, mm: Math.round(d.rainMm ?? 0) }));

function excessRain(e: Env): Composition | null {
  const mm = num(e.d.mm);
  if (mm === null) return null;
  const window = tk(`email.alert.window_${e.d.window === "7d" || e.d.window === "72h" ? e.d.window : "24h"}`);
  let days = rainDays(e);
  if (days.length < 2) days = list(e.d.days).map((x) => ({ date: str(x.date), mm: num(x.mm) ?? 0 }));
  const peak = days.reduce((a, b) => (b.mm > a.mm ? b : a), { date: "", mm: -1 });
  const kpis: Kpi[] = [{ label: t("email.alert.rainKpiTotal", { window }), value: fmtNum(mm), unit: "mm" }];
  if (peak.date) kpis.push({ label: t("email.alert.rainKpiPeak"), value: String(peak.mm), unit: `mm ${weekdayShort(peak.date)}` });
  if (days.length > 1) kpis.push({ label: t("email.alert.rainKpiDays"), value: String(days.filter((x) => x.mm >= 1).length) });
  const chart = days.length > 1 ? [sectionTitle(t("email.alert.rainChart")), barChart({
    bars: days.map((x) => ({ label: weekdayShort(x.date), value: x.mm, strong: x.mm >= 30 })),
    legend: [
      { color: C.skyDark, text: t("email.alert.rainLegendStrong", { mm: 30 }) },
      { color: C.sky, text: t("email.alert.rainLegendLight", { mm: 30 }) },
    ],
  })] : [];
  return {
    headline: t("email.alert.headline_excess_rain", { mm: fmtNum(mm), window }),
    lead: peak.date ? t("email.alert.lead_excess_rain", { day: weekdayLong(peak.date), mm: peak.mm }) : undefined,
    kpis,
    blocks: [...chart, ...plotsBlock("plots", e.ctx.plots)],
  };
}

const frostColor = (c: number): { color: string; light: boolean } =>
  c <= 0 ? { color: C.skyDark, light: true } : c <= 2 ? { color: C.sky, light: false } : c <= 5 ? { color: C.skyLight, light: false } : { color: C.soft, light: false };

/** Horas de la noche más fría: 6 antes y 6 después de la mínima del pronóstico horario. */
function nightHours(hours: HourForecast[]): HourForecast[] {
  const known = hours.filter((h) => h.tempC !== null).slice(0, 40);
  if (known.length < 8) return [];
  const at = known.reduce((m, h, i) => (h.tempC! < known[m]!.tempC! ? i : m), 0);
  const from = Math.max(0, Math.min(at - 6, known.length - 13));
  return known.slice(from, from + 13);
}

function frost(e: Env): Composition | null {
  const night = nightHours(e.ctx.hours);
  const daily = list(e.d.days).flatMap((x) => (num(x.tminC) !== null ? [{ date: str(x.date), c: num(x.tminC)! }] : []));
  const min = night.length ? Math.min(...night.map((h) => h.tempC!)) : daily.length ? Math.min(...daily.map((x) => x.c)) : null;
  if (min === null) return null;
  const all = e.ctx.hours.filter((h) => h.tempC !== null).slice(0, 48);
  const below = (c: number) => all.filter((h) => h.tempC! <= c).length;
  const minHour = night.length ? night.reduce((m, h) => (h.tempC! < m.tempC! ? h : m)) : null;
  const kpis: Kpi[] = [{ label: t("email.alert.frostKpiMin"), value: fmtNum(min, 1), unit: "°C" }];
  if (minHour) kpis.push({ label: t("email.alert.frostKpiTime"), value: localTime(minHour.at, e.tz) });
  if (all.length) {
    kpis.push({ label: t("email.alert.frostKpiBelow0"), value: String(below(0)) }, { label: t("email.alert.frostKpiBelow2"), value: String(below(2)) });
  }
  const strip = night.length
    ? heatStrip(night.map((h) => ({ label: localTime(h.at, e.tz).slice(0, 2), value: String(Math.round(h.tempC!)), ...frostColor(h.tempC!) })))
    : heatStrip(daily.slice(0, 7).map((x) => ({ label: weekdayShort(x.date), value: String(Math.round(x.c)), ...frostColor(x.c) })));
  return {
    headline: t("email.alert.headline_frost", { min: fmtNum(min, 1) }),
    lead: minHour
      ? t("email.alert.lead_frost", { n: below(2), time: localTime(minHour.at, e.tz) })
      : daily.length
        ? t("email.alert.lead_frostDays", { n: daily.length, from: dm(daily[0]!.date), to: dm(daily[daily.length - 1]!.date) })
        : undefined,
    kpis,
    blocks: [
      sectionTitle(t(night.length ? "email.alert.frostStrip" : "email.alert.frostDays")),
      strip,
      legend([
        { color: C.skyDark, text: t("email.alert.frostLegend0") },
        { color: C.sky, text: t("email.alert.frostLegend2") },
        { color: C.skyLight, text: t("email.alert.frostLegend5") },
      ]),
      ...plotsBlock("plotsFrost", e.ctx.plots),
    ],
  };
}

function drought(e: Env): Composition | null {
  const rain = num(e.d.rain30);
  const normal = num(e.d.normal30);
  if (rain === null || normal === null || normal <= 0) return null;
  const pct = Math.round((rain / normal) * 100);
  const series = e.ctx.rainDaily;
  let dry = 0;
  for (let i = series.length - 1; i >= 0 && series[i]!.mm < 1; i--) dry++;
  let acc = 0;
  const cumulative = series.map((x) => (acc += x.mm));
  const kpis: Kpi[] = [];
  if (series.length) kpis.push({ label: t("email.alert.droughtKpiDry"), value: String(dry) });
  kpis.push(
    { label: t("email.alert.droughtKpiRain"), value: fmtNum(rain), unit: "mm" },
    { label: t("email.alert.droughtKpiDeficit"), value: String(Math.max(0, 100 - pct)), unit: "%" },
  );
  return {
    headline: t("email.alert.headline_drought", { pct }),
    lead: t("email.alert.lead_drought", { rain: fmtNum(rain), normal: fmtNum(normal) }),
    kpis,
    blocks: [
      sectionTitle(t("email.alert.droughtCompare")),
      compareBars([
        { label: t("email.alert.droughtRain"), value: rain, display: `${fmtNum(rain)} mm`, color: C.skyDark, strong: true },
        { label: t("email.alert.droughtNormal"), value: normal, display: `${fmtNum(normal)} mm`, color: C.skyLight },
      ]),
      ...(cumulative.length >= 7 ? [sectionTitle(t("email.alert.droughtSpark")), sparkline(cumulative)] : []),
      ...plotsBlock("plots", e.ctx.plots),
    ],
  };
}

function fire(e: Env): Composition | null {
  const km = num(e.d.minDistanceKm);
  if (km === null) return null;
  const n = num(e.d.hotspots) ?? 0;
  const toward = e.d.windTowardsFarm === true;
  const level = km < 5 ? 3 : km < 15 ? 2 : km < 30 ? 1 : 0;
  const segments = [
    { label: t("email.alert.fireSeg4"), color: C.soy },
    { label: t("email.alert.fireSeg3"), color: C.wheat },
    { label: t("email.alert.fireSeg2"), color: C.alert },
    { label: t("email.alert.fireSeg1"), color: C.alertDark },
  ];
  return {
    headline: t("email.alert.headline_fire", { km: fmtNum(km, 1) }),
    lead: t("email.alert.lead_fire", { n, wind: t(toward ? "email.alert.lead_fireWindToward" : "email.alert.lead_fireWindOther") }),
    kpis: [
      { label: t("email.alert.fireKpiCount"), value: String(n) },
      { label: t("email.alert.fireKpiNearest"), value: fmtNum(km, 1), unit: "km" },
      { label: t("email.alert.fireKpiWind"), value: t(toward ? "email.common.yes" : "email.common.no") },
    ],
    blocks: [sectionTitle(t("email.alert.fireScale")), scale(segments, level, `${fmtNum(km, 1)} km`), ...plotsBlock("plots", e.ctx.plots)],
  };
}

function pest(e: Env): Composition | null {
  const hits = list(e.d.hits).flatMap((h) => (num(h.avg) !== null && num(h.threshold) !== null ? [{ plotId: str(h.plotId), pest: str(h.pest), avg: num(h.avg)!, threshold: num(h.threshold)! }] : []));
  const top = hits[0];
  if (!top) return null;
  const name = (id: string) => e.ctx.plots.find((p) => p.id === id)?.name ?? "";
  const over = top.threshold > 0 ? Math.round((top.avg / top.threshold - 1) * 100) : 0;
  const rows = hits.slice(0, 6).map((h) => {
    const plot = e.ctx.plots.find((p) => p.id === h.plotId);
    return { color: plotColor(plot?.crop ?? null, plot?.kind), name: plot?.name ?? h.pest, detail: h.pest.replace(/_/g, " "), value: `${fmtNum(h.avg, 1)} de ${fmtNum(h.threshold, 1)}` };
  });
  return {
    headline: name(top.plotId) ? t("email.alert.headline_pest_threshold", { plot: name(top.plotId) }) : undefined,
    lead: e.summary,
    kpis: [
      { label: t("email.alert.pestKpiAvg"), value: fmtNum(top.avg, 1) },
      { label: t("email.alert.pestKpiThreshold"), value: fmtNum(top.threshold, 1) },
      { label: t("email.alert.pestKpiOver"), value: String(Math.max(0, over)), unit: "%" },
    ],
    blocks: [
      sectionTitle(t("email.alert.pestProgress")),
      progress({ label: t("email.alert.pestKpiAvg"), display: `${fmtNum(top.avg, 1)} de ${fmtNum(top.threshold, 1)}`, value: top.avg, max: Math.max(top.avg, top.threshold), color: C.alert }),
      sectionTitle(t("email.alert.plotsPest")),
      plotList(rows),
    ],
  };
}

function waterLow(e: Env): Composition | null {
  const pois = list(e.d.pois);
  if (!pois.length) return null;
  const dry = pois.filter((p) => p.level === "dry").length;
  const rows = pois.slice(0, 6).map((p) => {
    const at = num(p.capturedAt);
    return {
      color: p.level === "dry" ? C.alert : C.wheat,
      name: str(p.name) || "-",
      detail: at ? t("email.alert.waterSeen", { date: dm(localDate(at, e.tz)) }) : "",
      value: t(p.level === "dry" ? "email.alert.waterDry" : "email.alert.waterLow"),
    };
  });
  return {
    headline: pois.length === 1 ? t("email.alert.headline_water_one") : t("email.alert.headline_water_many", { n: pois.length }),
    lead: e.summary,
    kpis: [
      { label: t("email.alert.waterKpiCount"), value: String(pois.length) },
      { label: t("email.alert.waterKpiDry"), value: String(dry) },
    ],
    blocks: [sectionTitle(t("email.alert.waterList")), plotList(rows)],
  };
}

function heatStress(e: Env): Composition | null {
  const thi = num(e.d.maxThi);
  if (thi === null) return null;
  const level = thi >= 84 ? 3 : thi >= 79 ? 2 : thi >= 75 ? 1 : 0;
  const segments = [
    { label: t("email.alert.heatNormal"), range: "< 75", color: C.soy },
    { label: t("email.alert.heatAlert"), range: "75 a 78", color: C.wheat },
    { label: t("email.alert.heatDanger"), range: "79 a 83", color: C.alert },
    { label: t("email.alert.heatEmergency"), range: "84 o más", color: C.alertDark },
  ];
  const days = e.ctx.days.filter((d) => d.date >= e.today).slice(0, 5);
  const danger = num(e.d.dangerHours) ?? 0;
  const emergency = num(e.d.emergencyHours) ?? 0;
  return {
    headline: t("email.alert.headline_heat_stress", { thi: Math.round(thi) }),
    lead: t("email.alert.lead_heat_stress", { danger, emergency }),
    kpis: [
      { label: t("email.alert.heatKpiThi"), value: String(Math.round(thi)) },
      { label: t("email.alert.heatKpiDanger"), value: String(danger) },
      { label: t("email.alert.heatKpiEmergency"), value: String(emergency) },
    ],
    blocks: [
      sectionTitle(t("email.alert.heatScale")),
      scale(segments, level, String(Math.round(thi))),
      ...(days.length >= 3
        ? [sectionTitle(t("email.alert.heatForecast")), forecastStrip(days.map((d) => ({ label: weekdayShort(d.date), max: d.tmax, min: d.tmin, rainMm: d.rainMm })))]
        : []),
      ...plotsBlock("plots", e.ctx.plots),
    ],
  };
}

function rustRisk(e: Env): Composition | null {
  const days = list(e.d.wetHoursByDay).flatMap((x) => (num(x.wetHours) !== null ? [{ date: str(x.date), h: num(x.wetHours)! }] : []));
  if (!days.length) return null;
  const th = (e.d.thresholds ?? {}) as Record<string, unknown>;
  const watch = num(th.watchHours) ?? 6;
  const warning = num(th.warningHours) ?? 10;
  const peak = days.reduce((a, b) => (b.h > a.h ? b : a));
  const level = peak.h >= warning ? 2 : peak.h >= watch ? 1 : 0;
  const color = (h: number) => (h >= warning ? C.alert : h >= watch ? C.wheat : C.soy);
  return {
    headline: t("email.alert.headline_rust_risk", { h: peak.h }),
    lead: t("email.alert.lead_rust_risk", { day: weekdayLong(peak.date), h: peak.h }),
    kpis: [
      { label: t("email.alert.rustKpiPeak"), value: String(peak.h), unit: "h" },
      { label: t("email.alert.rustKpiDays"), value: String(days.filter((d) => d.h >= watch).length) },
      { label: t("email.alert.rustKpiLimit"), value: String(warning), unit: "h" },
    ],
    blocks: [
      sectionTitle(t("email.alert.rustScale")),
      scale(
        [
          { label: t("email.alert.rustLow"), range: `< ${watch} h`, color: C.soy },
          { label: t("email.alert.rustMid"), range: `${watch} a ${warning - 1} h`, color: C.wheat },
          { label: t("email.alert.rustHigh"), range: `${warning} h o más`, color: C.alert },
        ],
        level,
        `${peak.h} h`,
      ),
      sectionTitle(t("email.alert.rustChart")),
      barChart({
        bars: days.slice(0, 7).map((d) => ({ label: weekdayShort(d.date), value: d.h, strong: d.h >= watch, color: color(d.h) })),
        legend: [
          { color: C.alert, text: t("email.alert.rustLegendHigh", { h: warning }) },
          { color: C.wheat, text: t("email.alert.rustLegendMid", { h: watch }) },
          { color: C.soy, text: t("email.alert.rustLegendLow") },
        ],
      }),
      ...plotsBlock("plotsRust", e.ctx.plots),
    ],
  };
}

function senacsa(e: Env): Composition | null {
  const from = str(e.d.from);
  const to = str(e.d.to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const total = daysBetween(from, to) + 1;
  const day = daysBetween(from, e.today) + 1;
  const open = day >= 1;
  const kpis: Kpi[] = [
    { label: t("email.alert.senacsaKpiDeadline"), value: dm(to) },
    { label: t("email.alert.senacsaKpiLeft"), value: String(Math.max(0, daysBetween(e.today, to))) },
  ];
  if (!open) kpis.push({ label: t("email.alert.senacsaKpiOpens"), value: dm(from) });
  return {
    headline: t("email.alert.headline_senacsa", { date: dm(to) }),
    lead: e.summary,
    kpis,
    blocks: [
      sectionTitle(t("email.alert.senacsaProgress")),
      progress({
        label: `${dm(from)} al ${dm(to)}`,
        display: open ? t("email.alert.senacsaDay", { day: Math.min(day, total), total }) : t("email.alert.senacsaBefore"),
        value: open ? Math.min(day, total) : 0,
        max: total,
        color: C.soy,
      }),
    ],
  };
}

/** Compositor de cada tipo de aviso. */
export const KIND_COMPOSERS: Record<string, (e: Env) => Composition | null> = {
  frost,
  excess_rain: excessRain,
  drought,
  fire,
  pest_threshold: pest,
  water_low: waterLow,
  heat_stress: heatStress,
  rust_risk: rustRisk,
  senacsa,
};
