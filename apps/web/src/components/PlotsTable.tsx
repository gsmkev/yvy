import type { Plot } from "../lib/types";
import { BRAND } from "@yvy/shared";
import { fmtNdvi, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
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
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-tinta-2">
          <th className="pb-2 font-medium">{t("ui.plot")}</th>
          <th className="pb-2 font-medium">{t("ui.kind")}</th>
          <th className="pb-2 text-right font-medium">ha</th>
          <th className="pb-2 text-right font-medium">{t("ui.vigor")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-linea border-t border-linea">
        {plots.map((p) => (
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
