import { useMemo, useState } from "react";
import type { Plot } from "../lib/types";
import { BRAND } from "@yvy/shared";
import { fmtDay, fmtNdvi, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { defaultDir, sortPlots, type SortDir, type SortKey } from "../lib/plotsSort";
import { ndviColor } from "../lib/vigor";

/** Muestra del color de la rampa NDVI junto al valor; sin pasadas procesadas, un guion. */
export function Vigor({ value }: { value: number | null }) {
  if (value === null) return <span className="text-tinta-2">—</span>;
  return (
    <span className="num inline-flex items-center justify-end gap-2">
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: ndviColor(value) }} aria-hidden />
      {fmtNdvi(value)}
    </span>
  );
}

export function PlotsTable({ plots, onSelect }: { plots: Plot[]; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const rows = useMemo(() => sortPlots(plots, sort.key, sort.dir), [plots, sort]);
  const pick = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }));
  const head = (key: SortKey, label: string, right = false) => (
    <th
      className={`pb-2 font-medium ${right ? "text-right" : ""}`}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => pick(key)}
        className={`cursor-pointer font-medium underline-offset-4 hover:text-surco hover:underline ${sort.key === key ? "text-surco underline" : ""}`}
      >
        {label}
        {sort.key === key && (sort.dir === "asc" ? " ↑" : " ↓")}
      </button>
    </th>
  );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-tinta-2">
          {head("name", t("ui.plot"))}
          {head("kind", t("ui.kind"))}
          {head("area", "ha", true)}
          {head("vigor", t("ui.vigor"), true)}
          {head("visit", t("ui.lastVisitShort"), true)}
        </tr>
      </thead>
      <tbody className="divide-y divide-linea border-t border-linea">
        {rows.map((p) => (
          <tr key={p.id} className="cursor-pointer hover:bg-surco/[0.03]" onClick={() => onSelect(p.id)}>
            <td className="py-2.5">
              <button className="flex cursor-pointer items-center gap-2.5 text-left font-medium" aria-label={p.name}>
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: p.color ?? (p.kind === "pasture" ? BRAND.trigo : BRAND.soja) }}
                />
                {p.name}
              </button>
            </td>
            <td className="py-2.5 text-tinta-2">{p.kind === "pasture" ? t("ui.pasture") : (p.crop ?? t("ui.crop"))}</td>
            <td className="num py-2.5 text-right">{fmtNum(p.areaHa)}</td>
            <td className="py-2.5 text-right">
              <Vigor value={p.ndviMean} />
            </td>
            <td className="num py-2.5 text-right text-tinta-2">{p.lastRecordAt ? fmtDay(p.lastRecordAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
