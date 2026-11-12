/** Resumen legible de un registro, en es-PY, a partir de sus datos (web, Excel, PDF y app). */
import { hasKey, t, type MessageKey } from "./i18n";
import { HERD_CATEGORIES } from "./livestock";

const tr = (key: string, fallback: string) => (hasKey(key) ? t(key as MessageKey) : fallback);

const dec = (n: number) => String(n).replace(".", ",");

/** "Glifosato 2 L/ha" */
export const doseText = (p: { name?: unknown; dose?: unknown; unit?: unknown }): string =>
  `${String(p.name ?? "")} ${dec(Number(p.dose))} ${tr(`fields.doseUnit_${p.unit}`, String(p.unit ?? ""))}`.trim();

export function describeRecord(kind: string, data: Record<string, unknown>): string {
  const d = data ?? {};
  const parts: string[] = [];
  const str = (k: string) => (typeof d[k] === "string" && d[k] !== "" ? (d[k] as string) : null);
  switch (kind) {
    case "rain":
      if (typeof d.mm === "number") parts.push(`${d.mm} mm`);
      break;
    case "irrigation":
      if (typeof d.mm === "number") parts.push(t("fields.mmValue", { n: dec(d.mm) }));
      if (str("method")) parts.push(tr(`fields.irrigationMethod_${d.method}`, String(d.method)).toLowerCase());
      break;
    case "pest":
      if (str("pest")) parts.push(tr(`fields.pest_${d.pest}`, String(d.pest)));
      if (str("intensity"))
        parts.push(
          t("fields.intensityValue", { v: tr(`fields.level_${d.intensity}`, String(d.intensity)).toLowerCase() }),
        );
      if (typeof d.perMeter === "number") parts.push(t("fields.perMeterValue", { n: d.perMeter }));
      if (Array.isArray(d.stations))
        parts.push(t(d.stations.length === 1 ? "app.stationsValueOne" : "app.stationsValue", { n: d.stations.length }));
      break;
    case "crop_status":
      if (str("stage")) parts.push(tr(`fields.stage_${d.stage}`, String(d.stage)));
      if (str("condition")) parts.push(tr(`fields.condition_${d.condition}`, String(d.condition)).toLowerCase());
      break;
    case "pasture_status":
      if (typeof d.heightCm === "number") parts.push(t("fields.heightValue", { n: d.heightCm }));
      if (str("cover"))
        parts.push(t("fields.coverValue", { v: tr(`fields.level_${d.cover}`, String(d.cover)).toLowerCase() }));
      if (typeof d.livestockPresent === "boolean")
        parts.push(t(d.livestockPresent ? "fields.withLivestock" : "fields.withoutLivestock").toLowerCase());
      break;
    case "water":
      if (str("level")) parts.push(tr(`fields.water_${d.level}`, String(d.level)));
      break;
    case "scouting":
      if (str("condition")) parts.push(tr(`fields.condition_${d.condition}`, String(d.condition)));
      break;
    case "herd_count": {
      const c = (d.counts ?? {}) as Record<string, number>;
      const total = HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0);
      let head = t("fields.herdTotalValue", { n: total });
      const detail = HERD_CATEGORIES.filter((k) => typeof c[k] === "number" && c[k]! > 0).map((k) =>
        t(`fields.herdCount_${k}`, { n: c[k]! }),
      );
      if (detail.length) head = `${head}: ${detail.join(", ")}`;
      parts.push(head);
      break;
    }
    case "herd_move": {
      const c = (d.counts ?? {}) as Record<string, number>;
      const total = HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0);
      parts.push(t("fields.herdTotalValue", { n: total }));
      if (str("reason")) parts.push(tr(`fields.moveReason_${d.reason}`, String(d.reason)).toLowerCase());
      break;
    }
    case "mortality":
      if (typeof d.head === "number" && str("category"))
        parts.push(`${d.head} ${tr(`fields.herd_${d.category}`, String(d.category)).toLowerCase()}`);
      if (str("cause")) parts.push(tr(`fields.cause_${d.cause}`, String(d.cause)).toLowerCase());
      break;
    case "reproduction": {
      if (str("event")) parts.push(tr(`fields.reproEvent_${d.event}`, String(d.event)));
      if (typeof d.head === "number") parts.push(t("fields.herdTotalValue", { n: d.head }));
      if (typeof d.pregnant === "number") parts.push(t("fields.reproPregnantValue", { n: d.pregnant }));
      if (typeof d.calves === "number") parts.push(t("fields.reproCalvesValue", { n: d.calves }));
      if (str("tag")) parts.push(t("fields.tagValue", { n: d.tag as string }));
      break;
    }
    case "weighing":
      if (typeof d.kg === "number") parts.push(t("fields.kgValue", { n: dec(d.kg) }));
      if (str("tag")) parts.push(t("fields.tagValue", { n: d.tag as string }));
      else if (str("group")) parts.push(d.group as string);
      if (typeof d.head === "number" && !str("tag")) parts.push(t("fields.herdTotalValue", { n: d.head }));
      break;
    case "supplement":
      if (str("type")) parts.push(tr(`fields.supplementType_${d.type}`, String(d.type)));
      if (typeof d.kg === "number") parts.push(t("fields.kgValue", { n: d.kg }));
      break;
    case "theft":
      if (typeof d.head === "number" && str("category"))
        parts.push(`${d.head} ${tr(`fields.herd_${d.category}`, String(d.category)).toLowerCase()}`);
      if (str("policeReport")) parts.push(t("fields.policeReportValue", { n: d.policeReport as string }));
      break;
    case "health": {
      const c = (d.counts ?? {}) as Record<string, number>;
      if (str("reason")) parts.push(tr(`fields.healthReason_${d.reason}`, String(d.reason)));
      if (str("product")) parts.push(d.product as string);
      parts.push(t("fields.herdTotalValue", { n: HERD_CATEGORIES.reduce((n, k) => n + (c[k] ?? 0), 0) }));
      if (str("tag")) parts.push(t("fields.tagValue", { n: d.tag as string }));
      break;
    }
    case "sowing":
      if (str("crop")) parts.push(tr(`fields.crop_${d.crop}`, String(d.crop)));
      if (str("variety")) parts.push(d.variety as string);
      if (typeof d.density === "number" && str("densityUnit"))
        parts.push(`${d.density} ${tr(`fields.densityUnit_${d.densityUnit}`, String(d.densityUnit))}`);
      if (typeof d.areaHa === "number") parts.push(t("fields.areaDoneValue", { n: d.areaHa }));
      break;
    case "harvest":
      if (typeof d.tons === "number") parts.push(t("fields.tonsValue", { n: dec(d.tons) }));
      if (typeof d.moisturePct === "number") parts.push(t("fields.moistureValue", { n: dec(d.moisturePct) }));
      if (typeof d.areaHa === "number") parts.push(t("fields.areaDoneValue", { n: dec(d.areaHa) }));
      if (str("destination")) parts.push(tr(`fields.destination_${d.destination}`, String(d.destination)).toLowerCase());
      break;
    case "fertilization": {
      const list = Array.isArray(d.products) ? (d.products as Record<string, unknown>[]) : [];
      if (list.length) parts.push(list.map(doseText).join(" + "));
      if (str("method")) parts.push(tr(`fields.method_${d.method}`, String(d.method)).toLowerCase());
      if (typeof d.areaHa === "number") parts.push(t("fields.areaDoneValue", { n: dec(d.areaHa) }));
      break;
    }
    case "application": {
      const list = Array.isArray(d.products) ? (d.products as Record<string, unknown>[]) : [];
      if (list.length) parts.push(list.map(doseText).join(" + "));
      if (typeof d.areaHa === "number") parts.push(t("fields.areaDoneValue", { n: dec(d.areaHa) }));
      if (typeof d.deltaT === "number") parts.push(t("fields.deltaTValue", { n: dec(d.deltaT) }));
      break;
    }
    case "track":
      if (typeof d.distanceM === "number") parts.push(t("fields.trackDistance", { km: dec(Number((d.distanceM / 1000).toFixed(2))) }));
      if (typeof d.durationS === "number") parts.push(t("fields.trackDuration", { min: Math.max(1, Math.round(d.durationS / 60)) }));
      break;
    case "fuel_load": {
      if (str("machine")) parts.push(d.machine as string);
      if (typeof d.liters === "number") parts.push(t("fields.litersValue", { n: dec(d.liters) }));
      if (typeof d.meterValue === "number") parts.push(t("fields.meterReading", { n: dec(d.meterValue) }));
      break;
    }
    case "feed":
      if (str("ration")) parts.push(d.ration as string);
      if (typeof d.kgDm === "number") parts.push(t("fields.kgDmValue", { n: dec(d.kgDm) }));
      break;
    case "stock_count":
      if (Array.isArray(d.lines)) parts.push(t("ui.countSummary", { n: d.lines.length }));
      break;
    case "note":
      if (str("text")) parts.push(d.text as string);
      break;
  }
  if (kind !== "note" && str("note")) parts.push(d.note as string);
  const out = parts.join(" · ");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : tr(`recordKinds.${kind}`, kind);
}
