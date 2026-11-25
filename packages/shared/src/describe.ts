/** Resumen legible de un registro, en es-PY, a partir de sus datos (web, Excel, PDF y app). */
import { hasKey, t, type MessageKey } from "./i18n";
import { HERD_CATEGORIES } from "./livestock";
import { sprayWarnings } from "./agro";
import { LIMITS } from "./limits";

const tr = (key: string, fallback: string) => (hasKey(key) ? t(key as MessageKey) : fallback);

const dec = (n: number) => String(n).replace(".", ",");

/** "Glifosato 2 L/ha" */
export const doseText = (p: { name?: unknown; dose?: unknown; unit?: unknown }): string =>
  `${String(p.name ?? "")} ${dec(Number(p.dose))} ${tr(`fields.dose.unit_${p.unit}`, String(p.unit ?? ""))}`.trim();

type Rec = Record<string, unknown>;
type Counts = Record<string, number>;
/** Datos de un registro con los accesos que usan los resúmenes de cada tipo. */
interface Ctx {
  d: Rec;
  /** Texto no vacío del campo, o null. */
  str: (k: string) => string | null;
  /** Número del campo, o null si no es un número. */
  num: (k: string) => number | null;
}
type Describer = (c: Ctx) => (string | null)[];

const label = (key: string, v: unknown) => tr(key, String(v));
const lower = (key: string, v: unknown) => label(key, v).toLowerCase();
const countsOf = (d: Rec) => (d.counts ?? {}) as Counts;
const total = (c: Counts) => HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0);
const headCount = (n: number) => t("fields.herd.totalValue", { n });
const tag = (c: Ctx) => (c.str("tag") ? t("fields.common.tagValue", { n: c.d.tag as string }) : null);
const area = (c: Ctx) => {
  const n = c.num("areaHa");
  return n === null ? null : t("fields.area.doneValue", { n: dec(n) });
};
const products = (d: Rec) => (Array.isArray(d.products) ? (d.products as Rec[]) : []);
const doses = (d: Rec) => (products(d).length ? products(d).map(doseText).join(" + ") : null);
const headOf = (c: Ctx) =>
  c.num("head") !== null && c.str("category") ? `${c.d.head} ${lower(`fields.herd.${c.d.category}`, c.d.category)}` : null;

function herdCount({ d }: Ctx) {
  const c = countsOf(d);
  const detail = HERD_CATEGORIES.filter((k) => typeof c[k] === "number" && c[k]! > 0).map((k) =>
    t(`fields.herd.count_${k}`, { n: c[k]! }),
  );
  const head = headCount(total(c));
  return [detail.length ? `${head}: ${detail.join(", ")}` : head];
}

/** Cómo resumir cada tipo de registro; cada función devuelve las partes en el orden en que se muestran. */
const DESCRIBERS: Record<string, Describer> = {
  rain: (c) => [c.num("mm") === null ? null : `${c.d.mm} mm`],
  irrigation: (c) => [
    c.num("mm") === null ? null : t("fields.common.mmValue", { n: dec(c.d.mm as number) }),
    c.str("method") ? lower(`fields.irrigation.method_${c.d.method}`, c.d.method) : null,
  ],
  pest: (c) => [
    c.str("pest") ? label(`fields.pest.${c.d.pest}`, c.d.pest) : null,
    c.str("intensity") ? t("fields.common.intensityValue", { v: lower(`fields.level.${c.d.intensity}`, c.d.intensity) }) : null,
    c.num("perMeter") === null ? null : t("fields.per.meterValue", { n: c.d.perMeter as number }),
    Array.isArray(c.d.stations)
      ? t(c.d.stations.length === 1 ? "app.stations.valueOne" : "app.stations.value", { n: c.d.stations.length })
      : null,
  ],
  crop_status: (c) => [
    c.str("stage") ? label(`fields.stage.${c.d.stage}`, c.d.stage) : null,
    c.str("condition") ? lower(`fields.condition.${c.d.condition}`, c.d.condition) : null,
  ],
  pasture_status: (c) => [
    c.num("heightCm") === null ? null : t("fields.height.value", { n: c.d.heightCm as number }),
    c.str("cover") ? t("fields.common.coverValue", { v: lower(`fields.level.${c.d.cover}`, c.d.cover) }) : null,
    typeof c.d.livestockPresent === "boolean"
      ? t(c.d.livestockPresent ? "fields.common.withLivestock" : "fields.common.withoutLivestock").toLowerCase()
      : null,
  ],
  water: (c) => [c.str("level") ? label(`fields.water.${c.d.level}`, c.d.level) : null],
  scouting: (c) => [c.str("condition") ? label(`fields.condition.${c.d.condition}`, c.d.condition) : null],
  herd_count: herdCount,
  herd_move: (c) => [
    headCount(total(countsOf(c.d))),
    c.str("reason") ? lower(`fields.move.reason_${c.d.reason}`, c.d.reason) : null,
  ],
  mortality: (c) => [headOf(c), c.str("cause") ? lower(`fields.cause.${c.d.cause}`, c.d.cause) : null],
  reproduction: (c) => [
    c.str("event") ? label(`fields.repro.event_${c.d.event}`, c.d.event) : null,
    c.num("head") === null ? null : headCount(c.d.head as number),
    c.num("pregnant") === null ? null : t("fields.repro.pregnantValue", { n: c.d.pregnant as number }),
    c.num("calves") === null ? null : t("fields.repro.calvesValue", { n: c.d.calves as number }),
    tag(c),
  ],
  weighing: (c) => [
    c.num("kg") === null ? null : t("fields.kg.value", { n: dec(c.d.kg as number) }),
    c.str("tag") ? tag(c) : c.str("group"),
    c.num("head") !== null && !c.str("tag") ? headCount(c.d.head as number) : null,
  ],
  supplement: (c) => [
    c.str("type") ? label(`fields.supplement.type_${c.d.type}`, c.d.type) : null,
    c.num("kg") === null ? null : t("fields.kg.value", { n: c.d.kg as number }),
  ],
  theft: (c) => [headOf(c), c.str("policeReport") ? t("fields.police.reportValue", { n: c.d.policeReport as string }) : null],
  health: (c) => [
    c.str("reason") ? label(`fields.health.reason_${c.d.reason}`, c.d.reason) : null,
    c.str("product"),
    headCount(total(countsOf(c.d))),
    tag(c),
  ],
  sowing: (c) => [
    c.str("crop") ? label(`fields.crop.${c.d.crop}`, c.d.crop) : null,
    c.str("variety"),
    c.num("density") !== null && c.str("densityUnit")
      ? `${c.d.density} ${label(`fields.density.unit_${c.d.densityUnit}`, c.d.densityUnit)}`
      : null,
    c.num("areaHa") === null ? null : t("fields.area.doneValue", { n: c.d.areaHa as number }),
  ],
  harvest: (c) => [
    c.num("tons") === null ? null : t("fields.common.tonsValue", { n: dec(c.d.tons as number) }),
    c.num("moisturePct") === null ? null : t("fields.moisture.value", { n: dec(c.d.moisturePct as number) }),
    area(c),
    c.str("destination") ? lower(`fields.destination.${c.d.destination}`, c.d.destination) : null,
  ],
  fertilization: (c) => [doses(c.d), c.str("method") ? lower(`fields.method.${c.d.method}`, c.d.method) : null, area(c)],
  application: (c) => [
    doses(c.d),
    area(c),
    c.num("deltaT") === null ? null : t("fields.delta.TValue", { n: dec(c.d.deltaT as number) }),
  ],
  track: (c) => [
    c.num("distanceM") === null ? null : t("fields.track.distance", { km: dec(Number(((c.d.distanceM as number) / 1000).toFixed(2))) }),
    c.num("durationS") === null ? null : t("fields.track.duration", { min: Math.max(1, Math.round((c.d.durationS as number) / 60)) }),
  ],
  fuel_load: (c) => [
    c.str("machine"),
    c.num("liters") === null ? null : t("fields.common.litersValue", { n: dec(c.d.liters as number) }),
    c.num("meterValue") === null ? null : t("fields.meter.reading", { n: dec(c.d.meterValue as number) }),
  ],
  feed: (c) => [c.str("ration"), c.num("kgDm") === null ? null : t("fields.kg.dmValue", { n: dec(c.d.kgDm as number) })],
  stock_count: (c) => [Array.isArray(c.d.lines) ? t("ui.count.summary", { n: c.d.lines.length }) : null],
  note: (c) => [c.str("text")],
};

/** Resumen en una línea de un registro de tipo `kind` a partir de sus datos, en es-PY. */
export function describeRecord(kind: string, data: Record<string, unknown>): string {
  const d = data ?? {};
  const str = (k: string) => (typeof d[k] === "string" && d[k] !== "" ? (d[k] as string) : null);
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const parts = (DESCRIBERS[kind]?.({ d, str, num }) ?? []).filter((p): p is string => p !== null);
  if (kind !== "note" && str("note")) parts.push(d.note as string);
  const out = parts.join(", ");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : tr(`record-kinds.kind.${kind}`, kind);
}

/** Avisos de condiciones al aplicar ya redactados, en es-PY: uno por cada umbral de LIMITS.spray que se pasó. */
export function sprayWarningTexts(c: { windKmh?: number | null; deltaT?: number | null }): string[] {
  const L = LIMITS.spray;
  return sprayWarnings(c).map((w) =>
    w === "windHigh"
      ? t("ui.spray.warnWind", { wind: dec(c.windKmh as number), max: L.windMaxKmh })
      : w === "deltaTLow"
        ? t("ui.spray.warnDeltaLow", { dt: dec(c.deltaT as number), min: L.deltaTMin })
        : t("ui.spray.warnDeltaHigh", { dt: dec(c.deltaT as number), max: L.deltaTMax }),
  );
}
