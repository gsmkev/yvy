import { HERD_CATEGORIES, areaLabel, haToArea, t, uaOf, uaPerHa, type MessageKey } from "@yvy/shared";
import type { Plot } from "../../db/store";
import { getDb } from "../../lib/db";
import { fmtDate, fmtNumber } from "../format";

type Stock = NonNullable<ReturnType<ReturnType<typeof getDb>["herdStock"]>>;
export type HerdRow = { plot: Plot; st: Stock | null; ua: number };

/** Potreros con hacienda de la estancia, calculados con los conteos y movimientos del celular, los de más UA primero. */
export function herdRows(farmId: string): HerdRow[] {
  const db = getDb();
  return db
    .plots(farmId)
    .filter((p) => p.kind === "pasture")
    .map((p) => {
      const st = db.herdStock(p.id);
      return { plot: p, st, ua: st ? uaOf(st.counts) : 0 };
    })
    .filter((r) => r.st && r.st.total > 0)
    .sort((a, b) => b.ua - a.ua);
}

/** Cabezas, UA y carga de toda la estancia, y los potreros que pasan el límite. */
export function herdTotals(rows: HerdRow[], maxUa: number) {
  const head = rows.reduce((n, r) => n + (r.st?.total ?? 0), 0);
  const ua = rows.reduce((n, r) => n + r.ua, 0);
  const area = rows.reduce((n, r) => n + r.plot.areaHa, 0);
  const farmUaHa = area > 0 ? ua / area : null;
  const over = rows.filter((r) => uaPerHa(r.st!.counts, r.plot.areaHa) !== null && uaPerHa(r.st!.counts, r.plot.areaHa)! > maxUa);
  return { head, ua, farmUaHa, over };
}

/** Categorías con cabezas, superficie y último conteo de un potrero. */
export function herdSubtitle(r: HerdRow, areaUnit: Parameters<typeof haToArea>[1]): string {
  return [
    HERD_CATEGORIES.filter((c) => r.st!.counts[c] > 0).map((c) => t(`fields.herdCount_${c}` as MessageKey, { n: r.st!.counts[c] })).join(", "),
    `${fmtNumber(haToArea(r.plot.areaHa, areaUnit))} ${areaLabel(areaUnit)}`,
    r.st!.lastCountAt ? t("office.farmsLastRecord", { date: fmtDate(r.st!.lastCountAt) }) : t("ui.herdNeverCounted"),
  ].join(" · ");
}

/** Carga recomendada contra la actual: "al día", cuántas UA sobran o cuántas faltan. */
export function loadLine(rp: { recommendedUaPerHa: number; diffUa: number }): string {
  const verdict = Math.abs(rp.diffUa) < 0.5 ? t("ui.herdLoadOk") : rp.diffUa > 0 ? t("ui.herdLoadSurplus", { n: fmtNumber(rp.diffUa, 1) }) : t("ui.herdLoadShortfall", { n: fmtNumber(-rp.diffUa, 1) });
  return `${t("ui.herdLoadRecommended")} ${fmtNumber(rp.recommendedUaPerHa, 2)} · ${verdict}`;
}
