/** Resumen legible de un registro, en es-PY, a partir de sus datos (web, Excel, PDF y app). */
import { hasKey, t, type MessageKey } from "./i18n";
import { HERD_CATEGORIES } from "./livestock";

const tr = (key: string, fallback: string) => (hasKey(key) ? t(key as MessageKey) : fallback);

export function describeRecord(kind: string, data: Record<string, unknown>): string {
  const d = data ?? {};
  const parts: string[] = [];
  const str = (k: string) => (typeof d[k] === "string" && d[k] !== "" ? (d[k] as string) : null);
  switch (kind) {
    case "rain":
      if (typeof d.mm === "number") parts.push(`${d.mm} mm`);
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
    case "note":
      if (str("text")) parts.push(d.text as string);
      break;
  }
  if (kind !== "note" && str("note")) parts.push(d.note as string);
  const out = parts.join(" · ");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : tr(`recordKinds.${kind}`, kind);
}
