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

export function describeRecord(kind: string, data: Record<string, unknown>): string {
  const d = data ?? {};
  const parts: string[] = [];
  const str = (k: string) => (typeof d[k] === "string" && d[k] !== "" ? (d[k] as string) : null);
  switch (kind) {
    case "rain":
      if (typeof d.mm === "number") parts.push(`${d.mm} mm`);
      break;
    case "irrigation":
      if (typeof d.mm === "number") parts.push(t("fields.common.mmValue", { n: dec(d.mm) }));
      if (str("method")) parts.push(tr(`fields.irrigation.method_${d.method}`, String(d.method)).toLowerCase());
      break;
    case "pest":
      if (str("pest")) parts.push(tr(`fields.pest.${d.pest}`, String(d.pest)));
      if (str("intensity"))
        parts.push(
          t("fields.common.intensityValue", { v: tr(`fields.level.${d.intensity}`, String(d.intensity)).toLowerCase() }),
        );
      if (typeof d.perMeter === "number") parts.push(t("fields.per.meterValue", { n: d.perMeter }));
      if (Array.isArray(d.stations))
        parts.push(t(d.stations.length === 1 ? "app.stations.valueOne" : "app.stations.value", { n: d.stations.length }));
      break;
    case "crop_status":
      if (str("stage")) parts.push(tr(`fields.stage.${d.stage}`, String(d.stage)));
      if (str("condition")) parts.push(tr(`fields.condition.${d.condition}`, String(d.condition)).toLowerCase());
      break;
    case "pasture_status":
      if (typeof d.heightCm === "number") parts.push(t("fields.height.value", { n: d.heightCm }));
      if (str("cover"))
        parts.push(t("fields.common.coverValue", { v: tr(`fields.level.${d.cover}`, String(d.cover)).toLowerCase() }));
      if (typeof d.livestockPresent === "boolean")
        parts.push(t(d.livestockPresent ? "fields.common.withLivestock" : "fields.common.withoutLivestock").toLowerCase());
      break;
    case "water":
      if (str("level")) parts.push(tr(`fields.water.${d.level}`, String(d.level)));
      break;
    case "scouting":
      if (str("condition")) parts.push(tr(`fields.condition.${d.condition}`, String(d.condition)));
      break;
    case "herd_count": {
      const c = (d.counts ?? {}) as Record<string, number>;
      const total = HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0);
      let head = t("fields.herd.totalValue", { n: total });
      const detail = HERD_CATEGORIES.filter((k) => typeof c[k] === "number" && c[k]! > 0).map((k) =>
        t(`fields.herd.count_${k}`, { n: c[k]! }),
      );
      if (detail.length) head = `${head}: ${detail.join(", ")}`;
      parts.push(head);
      break;
    }
    case "herd_move": {
      const c = (d.counts ?? {}) as Record<string, number>;
      const total = HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0);
      parts.push(t("fields.herd.totalValue", { n: total }));
      if (str("reason")) parts.push(tr(`fields.move.reason_${d.reason}`, String(d.reason)).toLowerCase());
      break;
    }
    case "mortality":
      if (typeof d.head === "number" && str("category"))
        parts.push(`${d.head} ${tr(`fields.herd.${d.category}`, String(d.category)).toLowerCase()}`);
      if (str("cause")) parts.push(tr(`fields.cause.${d.cause}`, String(d.cause)).toLowerCase());
      break;
    case "reproduction": {
      if (str("event")) parts.push(tr(`fields.repro.event_${d.event}`, String(d.event)));
      if (typeof d.head === "number") parts.push(t("fields.herd.totalValue", { n: d.head }));
      if (typeof d.pregnant === "number") parts.push(t("fields.repro.pregnantValue", { n: d.pregnant }));
      if (typeof d.calves === "number") parts.push(t("fields.repro.calvesValue", { n: d.calves }));
      if (str("tag")) parts.push(t("fields.common.tagValue", { n: d.tag as string }));
      break;
    }
    case "weighing":
      if (typeof d.kg === "number") parts.push(t("fields.kg.value", { n: dec(d.kg) }));
      if (str("tag")) parts.push(t("fields.common.tagValue", { n: d.tag as string }));
      else if (str("group")) parts.push(d.group as string);
      if (typeof d.head === "number" && !str("tag")) parts.push(t("fields.herd.totalValue", { n: d.head }));
      break;
    case "supplement":
      if (str("type")) parts.push(tr(`fields.supplement.type_${d.type}`, String(d.type)));
      if (typeof d.kg === "number") parts.push(t("fields.kg.value", { n: d.kg }));
      break;
    case "theft":
      if (typeof d.head === "number" && str("category"))
        parts.push(`${d.head} ${tr(`fields.herd.${d.category}`, String(d.category)).toLowerCase()}`);
      if (str("policeReport")) parts.push(t("fields.police.reportValue", { n: d.policeReport as string }));
      break;
    case "health": {
      const c = (d.counts ?? {}) as Record<string, number>;
      if (str("reason")) parts.push(tr(`fields.health.reason_${d.reason}`, String(d.reason)));
      if (str("product")) parts.push(d.product as string);
      parts.push(t("fields.herd.totalValue", { n: HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0) }));
      if (str("tag")) parts.push(t("fields.common.tagValue", { n: d.tag as string }));
      break;
    }
    case "sowing":
      if (str("crop")) parts.push(tr(`fields.crop.${d.crop}`, String(d.crop)));
      if (str("variety")) parts.push(d.variety as string);
      if (typeof d.density === "number" && str("densityUnit"))
        parts.push(`${d.density} ${tr(`fields.density.unit_${d.densityUnit}`, String(d.densityUnit))}`);
      if (typeof d.areaHa === "number") parts.push(t("fields.area.doneValue", { n: d.areaHa }));
      break;
    case "harvest":
      if (typeof d.tons === "number") parts.push(t("fields.common.tonsValue", { n: dec(d.tons) }));
      if (typeof d.moisturePct === "number") parts.push(t("fields.moisture.value", { n: dec(d.moisturePct) }));
      if (typeof d.areaHa === "number") parts.push(t("fields.area.doneValue", { n: dec(d.areaHa) }));
      if (str("destination")) parts.push(tr(`fields.destination.${d.destination}`, String(d.destination)).toLowerCase());
      break;
    case "fertilization": {
      const list = Array.isArray(d.products) ? (d.products as Record<string, unknown>[]) : [];
      if (list.length) parts.push(list.map(doseText).join(" + "));
      if (str("method")) parts.push(tr(`fields.method.${d.method}`, String(d.method)).toLowerCase());
      if (typeof d.areaHa === "number") parts.push(t("fields.area.doneValue", { n: dec(d.areaHa) }));
      break;
    }
    case "application": {
      const list = Array.isArray(d.products) ? (d.products as Record<string, unknown>[]) : [];
      if (list.length) parts.push(list.map(doseText).join(" + "));
      if (typeof d.areaHa === "number") parts.push(t("fields.area.doneValue", { n: dec(d.areaHa) }));
      if (typeof d.deltaT === "number") parts.push(t("fields.delta.TValue", { n: dec(d.deltaT) }));
      break;
    }
    case "track":
      if (typeof d.distanceM === "number") parts.push(t("fields.track.distance", { km: dec(Number((d.distanceM / 1000).toFixed(2))) }));
      if (typeof d.durationS === "number") parts.push(t("fields.track.duration", { min: Math.max(1, Math.round(d.durationS / 60)) }));
      break;
    case "fuel_load": {
      if (str("machine")) parts.push(d.machine as string);
      if (typeof d.liters === "number") parts.push(t("fields.common.litersValue", { n: dec(d.liters) }));
      if (typeof d.meterValue === "number") parts.push(t("fields.meter.reading", { n: dec(d.meterValue) }));
      break;
    }
    case "feed":
      if (str("ration")) parts.push(d.ration as string);
      if (typeof d.kgDm === "number") parts.push(t("fields.kg.dmValue", { n: dec(d.kgDm) }));
      break;
    case "stock_count":
      if (Array.isArray(d.lines)) parts.push(t("ui.count.summary", { n: d.lines.length }));
      break;
    case "note":
      if (str("text")) parts.push(d.text as string);
      break;
  }
  if (kind !== "note" && str("note")) parts.push(d.note as string);
  const out = parts.join(" · ");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : tr(`record-kinds.kind.${kind}`, kind);
}

/** Avisos de condiciones al aplicar (A-12) ya redactados, en es-PY: uno por cada umbral de LIMITS.spray que se pasó. */
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
