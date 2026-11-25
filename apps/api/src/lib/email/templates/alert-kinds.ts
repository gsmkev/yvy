/**
 * Composición de cada tipo de aviso agronómico: titular, frase, panel con el dato protagonista y widgets de la
 * tarjeta, armados solo con lo que trae el aviso (`details`) y los datos de contexto leídos al enviar.
 * Si falta un dato, ese widget se omite. El color solo aparece donde significa algo.
 */
import { localDate, localTime, t, tk, thi as thiOf } from "@yvy/shared";
import { P } from "../layout";
import { dm, weekdayLong, weekdayShort } from "../message";
import { compare, darkBars, darkStats, fmtNum, gap, gauge, h2, plotRows, progressBar, trend, type DarkBar, type Stat } from "../widgets";
import { list, num, str } from "./data";

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
  /** Fecha de siembra (ISO), si el lote la tiene. */
  sowingDate?: string | null;
  /** Distancia en km al foco de calor más cercano (solo avisos de fuego). */
  distKm?: number;
}

/** Datos de contexto que se leen al enviar un aviso (pronóstico cacheado, lotes, lluvia observada). */
export interface AlertContext {
  now: number;
  days: DayForecast[];
  hours: HourForecast[];
  plots: PlotInfo[];
  /** Lluvia observada de los últimos 30 días, de más vieja a más nueva. */
  rainDaily: { date: string; mm: number }[];
  /** Focos de calor por día de los últimos 7 (solo avisos de fuego). */
  hotspotsByDay?: { date: string; n: number }[];
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
  /** Panel oscuro bajo el titular: cifras y gráfico protagonista. */
  hero: string[];
  /** Widgets de la tarjeta blanca. */
  body: string[];
}

const ha = (n: number) => t("email.alert.plotArea", { ha: fmtNum(n, 1) });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const stats = (items: Stat[]) => darkStats(items);

/** Lotes alcanzados: nombre, cultivo y superficie, sin colores. */
function plotsBlock(titleKey: "plots" | "plotsFrost" | "plotsRust" | "plotsPest", plots: PlotInfo[]): string[] {
  if (!plots.length) return [];
  return [gap(24), h2(tk(`email.alert.${titleKey}`), "0 0 4px"), plotRows(plots.slice(0, 6).map((p) => ({ name: p.name, detail: p.sowingDate ? t("email.alert.plotSown", { date: dm(p.sowingDate) }) : undefined, value: ha(p.areaHa) })))];
}

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
  const bars: DarkBar[] = days.map((x) => ({ label: weekdayShort(x.date), value: x.mm, strong: x.mm >= 30 }));
  return {
    headline: t("email.alert.headline_excess_rain", { mm: fmtNum(mm), window }),
    lead: peak.date ? t("email.alert.lead_excess_rain", { day: weekdayLong(peak.date), mm: peak.mm }) : undefined,
    hero: days.length > 1 ? [gap(20), darkBars(bars, t("email.alert.rainLegend", { mm: 30 }))] : [],
    body: plotsBlock("plots", e.ctx.plots),
  };
}

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
  const minHour = night.length ? night.reduce((m, h) => (h.tempC! < m.tempC! ? h : m)) : null;
  const below2 = all.filter((h) => h.tempC! <= 2).length;
  const items: Stat[] = [{ label: t("email.alert.frostKpiMin"), value: `${fmtNum(min, 1)} °C` }];
  if (minHour) items.push({ label: t("email.alert.frostKpiTime"), value: localTime(minHour.at, e.tz) });
  if (all.length) items.push({ label: t("email.alert.frostKpiBelow2"), value: String(below2) });
  const temps = night.length ? night.map((h) => h.tempC!) : daily.map((x) => x.c);
  const floor = min - 0.25 * (Math.max(...temps) - min || 1);
  const bars: DarkBar[] = night.length
    ? night.map((h) => ({ label: localTime(h.at, e.tz).slice(0, 2), value: h.tempC! - floor, display: String(Math.round(h.tempC!)), strong: h === minHour }))
    : daily.slice(0, 7).map((x) => ({ label: weekdayShort(x.date), value: x.c - floor, display: String(Math.round(x.c)), strong: x.c === min }));
  return {
    headline: t("email.alert.headline_frost", { min: fmtNum(min, 1) }),
    lead: minHour
      ? t("email.alert.lead_frost", { n: below2, time: localTime(minHour.at, e.tz) })
      : daily.length
        ? t("email.alert.lead_frostDays", { n: daily.length, from: dm(daily[0]!.date), to: dm(daily[daily.length - 1]!.date) })
        : undefined,
    hero: [gap(22), stats(items), gap(22), darkBars(bars, t(night.length ? "email.alert.frostLegendHours" : "email.alert.frostLegendDays"))],
    body: plotsBlock("plotsFrost", e.ctx.plots),
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
  const items: Stat[] = [];
  if (series.length) items.push({ label: t("email.alert.droughtKpiDry"), value: String(dry) });
  items.push(
    { label: t("email.alert.droughtKpiRain"), value: `${fmtNum(rain)} mm` },
    { label: t("email.alert.droughtKpiDeficit"), value: `${Math.max(0, 100 - pct)} %`, delta: { text: t("email.alert.droughtDeficitChip"), tone: "bad" } },
  );
  return {
    headline: t("email.alert.headline_drought", { pct }),
    lead: t("email.alert.lead_drought", { rain: fmtNum(rain), normal: fmtNum(normal) }),
    hero: [gap(22), stats(items)],
    body: [
      h2(t("email.alert.droughtCompare")),
      compare([
        { label: t("email.alert.droughtRain"), value: rain, color: P.sky, text: `${fmtNum(rain)} mm` },
        { label: t("email.alert.droughtNormal"), value: normal, color: P.neutralBar, text: `${fmtNum(normal)} mm` },
      ]),
      ...(cumulative.length >= 7 ? [gap(24), h2(t("email.alert.droughtSpark")), trend(cumulative, P.sky)] : []),
      ...plotsBlock("plots", e.ctx.plots),
    ],
  };
}

function fire(e: Env): Composition | null {
  const km = num(e.d.minDistanceKm);
  if (km === null) return null;
  const n = num(e.d.hotspots) ?? 0;
  const toward = e.d.windTowardsFarm === true;
  const perDay = e.ctx.hotspotsByDay ?? [];
  const byDistance = e.ctx.plots.filter((p) => p.distKm !== undefined).sort((a, b) => a.distKm! - b.distKm!);
  const plots = byDistance.length
    ? [gap(24), h2(t("email.alert.plotsFire"), "0 0 4px"), plotRows(byDistance.slice(0, 6).map((p) => ({ name: p.name, detail: ha(p.areaHa), value: p.distKm! < 0.1 ? t("email.alert.fireInside") : `${fmtNum(p.distKm!, 1)} km` })))]
    : plotsBlock("plots", e.ctx.plots);
  return {
    headline: t("email.alert.headline_fire", { km: fmtNum(km, 1) }),
    lead: t("email.alert.lead_fire", { n, wind: t(toward ? "email.alert.lead_fireWindToward" : "email.alert.lead_fireWindOther") }),
    hero: [
      gap(22),
      stats([
        { label: t("email.alert.fireKpiCount"), value: String(n) },
        { label: t("email.alert.fireKpiNearest"), value: `${fmtNum(km, 1)} km` },
      ]),
      ...(perDay.some((d) => d.n > 0)
        ? [gap(22), darkBars(perDay.map((d) => ({ label: weekdayShort(d.date), value: d.n, strong: d.date === e.today })), t("email.alert.fireLegend"), 64)]
        : []),
    ],
    body: plots,
  };
}

function pest(e: Env): Composition | null {
  const hits = list(e.d.hits).flatMap((h) => (num(h.avg) !== null && num(h.threshold) !== null ? [{ plotId: str(h.plotId), pest: str(h.pest), avg: num(h.avg)!, threshold: num(h.threshold)! }] : []));
  const top = hits[0];
  if (!top) return null;
  const plotName = e.ctx.plots.find((p) => p.id === top.plotId)?.name ?? "";
  const over = top.threshold > 0 ? Math.round((top.avg / top.threshold - 1) * 100) : 0;
  const rows = hits.slice(0, 6).map((h) => ({
    name: e.ctx.plots.find((p) => p.id === h.plotId)?.name ?? h.pest.replace(/_/g, " "),
    detail: h.pest.replace(/_/g, " "),
    value: `${fmtNum(h.avg, 1)} de ${fmtNum(h.threshold, 1)}`,
    valueColor: P.alert,
  }));
  return {
    headline: plotName ? t("email.alert.headline_pest_threshold", { plot: plotName }) : undefined,
    lead: e.summary,
    hero: [
      gap(22),
      stats([
        { label: t("email.alert.pestKpiAvg"), value: fmtNum(top.avg, 1) },
        { label: t("email.alert.pestKpiThreshold"), value: fmtNum(top.threshold, 1) },
        { label: t("email.alert.pestKpiOver"), value: `${Math.max(0, over)} %`, delta: { text: t("email.alert.pestOverChip"), tone: "bad" } },
      ]),
    ],
    body: [
      h2(t("email.alert.pestProgress")),
      compare([
        { label: t("email.alert.pestKpiAvg"), value: top.avg, color: P.alert, text: fmtNum(top.avg, 1) },
        { label: t("email.alert.pestKpiThreshold"), value: top.threshold, color: P.neutralBar, text: fmtNum(top.threshold, 1) },
      ]),
      gap(24),
      h2(t("email.alert.plotsPest"), "0 0 4px"),
      plotRows(rows),
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
      name: str(p.name) || "-",
      detail: at ? t("email.alert.waterSeen", { date: dm(localDate(at, e.tz)) }) : undefined,
      value: t(p.level === "dry" ? "email.alert.waterDry" : "email.alert.waterLow"),
      valueColor: p.level === "dry" ? P.alert : P.wheatText,
    };
  });
  return {
    headline: pois.length === 1 ? t("email.alert.headline_water_one") : t("email.alert.headline_water_many", { n: pois.length }),
    lead: e.summary,
    hero: [
      gap(22),
      stats([
        { label: t("email.alert.waterKpiCount"), value: String(pois.length) },
        { label: t("email.alert.waterKpiDry"), value: String(dry) },
      ]),
    ],
    body: [h2(t("email.alert.waterList"), "0 0 4px"), plotRows(rows)],
  };
}

/** Máximo de THI por día a partir del pronóstico horario, para los próximos días. */
function thiByDay(e: Env): DarkBar[] {
  const byDay = new Map<string, number>();
  for (const h of e.ctx.hours) {
    if (h.tempC === null || h.humidityPct === null) continue;
    const day = localDate(h.at, e.tz);
    byDay.set(day, Math.max(byDay.get(day) ?? 0, Math.round(thiOf(h.tempC, h.humidityPct))));
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 4).map(([date, v]) => ({ label: weekdayShort(date), value: v - 60, display: String(v), strong: v >= 79 }));
}

function heatStress(e: Env): Composition | null {
  const thi = num(e.d.maxThi);
  if (thi === null) return null;
  const level = thi >= 84 ? "emergency" : thi >= 79 ? "danger" : thi >= 75 ? "alert" : "normal";
  const danger = num(e.d.dangerHours) ?? 0;
  const emergency = num(e.d.emergencyHours) ?? 0;
  const days = thiByDay(e);
  return {
    headline: t("email.alert.headline_heat_stress", { thi: Math.round(thi) }),
    lead: t("email.alert.lead_heat_stress", { danger, emergency }),
    hero: [
      gap(22),
      stats([
        { label: t("email.alert.heatKpiThi"), value: String(Math.round(thi)) },
        { label: t("email.alert.heatKpiDanger"), value: String(danger) },
        { label: t("email.alert.heatKpiEmergency"), value: String(emergency) },
      ]),
      ...(days.length >= 2 ? [gap(22), darkBars(days, t("email.alert.heatLegend"), 64)] : []),
    ],
    body: [
      h2(t("email.alert.heatScale")),
      gauge({
        value: thi,
        min: 65,
        max: 95,
        color: level === "alert" ? P.wheat : level === "normal" ? P.soy : P.alert,
        caption: t("email.alert.heatCaption", { thi: Math.round(thi), level: t(`email.alert.heat_${level}`) }),
        ticks: t("email.alert.heatTicks"),
      }),
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
  return {
    headline: t("email.alert.headline_rust_risk", { h: peak.h }),
    lead: t("email.alert.lead_rust_risk", { day: weekdayLong(peak.date), h: peak.h }),
    hero: [
      gap(22),
      stats([
        { label: t("email.alert.rustKpiPeak"), value: `${peak.h} h` },
        { label: t("email.alert.rustKpiDays"), value: String(days.filter((d) => d.h >= watch).length) },
        { label: t("email.alert.rustKpiLimit"), value: `${warning} h` },
      ]),
      gap(22),
      darkBars(days.slice(0, 7).map((d) => ({ label: weekdayShort(d.date), value: d.h, strong: d.h >= watch })), t("email.alert.rustLegend", { h: watch })),
    ],
    body: plotsBlock("plotsRust", e.ctx.plots),
  };
}

function senacsa(e: Env): Composition | null {
  const from = str(e.d.from);
  const to = str(e.d.to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const total = daysBetween(from, to) + 1;
  const day = daysBetween(from, e.today) + 1;
  const open = day >= 1;
  const items: Stat[] = [
    { label: t("email.alert.senacsaKpiDeadline"), value: dm(to) },
    { label: t("email.alert.senacsaKpiLeft"), value: String(Math.max(0, daysBetween(e.today, to))) },
  ];
  if (!open) items.push({ label: t("email.alert.senacsaKpiOpens"), value: dm(from) });
  return {
    headline: t("email.alert.headline_senacsa", { date: dm(to) }),
    lead: e.summary,
    hero: [gap(22), stats(items)],
    body: [
      h2(t("email.alert.senacsaProgress")),
      progressBar({ value: open ? Math.min(day, total) : 0, max: total, color: P.soy, caption: open ? t("email.alert.senacsaDay", { day: Math.min(day, total), total }) : t("email.alert.senacsaBefore") }),
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
