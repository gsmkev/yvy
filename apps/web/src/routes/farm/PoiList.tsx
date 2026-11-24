/** Puntos de interés de la estancia con su último nivel de agua; QR para imprimir y borrado con deshacer. */
import { isWaterPoi } from "@yvy/shared";
import { CopyCoords } from "../../components/CopyCoords";
import { PoiGlyph } from "../../components/PoiGlyph";
import { fmtDate } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import type { Poi } from "../../lib/types";

/** Puntos de interés de la estancia con su último nivel de agua; QR para imprimir y borrado con deshacer. */
export function PoiList({
  pois,
  canEdit,
  onQr,
  onRemove,
}: {
  pois: Poi[];
  canEdit: boolean;
  onQr: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <div className="mt-6 mb-2 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{t("ui.common.pois")}</h3>
        <button className="cursor-pointer text-xs text-tinta-2 underline underline-offset-4 hover:text-surco" onClick={onQr}>
          {t("app.poi.qrPrint")}
        </button>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {pois.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-2.5">
            <span>
              <PoiGlyph kind={p.kind} />
              {p.name}
              <span className="ml-2 text-xs text-tinta-2">{tk(`ui.poi.kinds_${p.kind}`)}</span>
              {isWaterPoi(p.kind) && (
                <span
                  className={`ml-2 text-xs ${p.lastWaterLevel === "low" || p.lastWaterLevel === "dry" ? "font-medium text-peligro" : "text-tinta-2"}`}
                >
                  {p.lastWaterLevel && p.lastWaterAt
                    ? t("ui.poi.lastWater", { level: tk(`fields.water.${p.lastWaterLevel}`).toLowerCase(), date: fmtDate(p.lastWaterAt) })
                    : t("ui.poi.noWater")}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-baseline gap-3 text-xs text-tinta-2">
              <CopyCoords lon={p.lon} lat={p.lat} className="!text-xs" />
              {canEdit && (
                <button className="cursor-pointer hover:text-peligro" onClick={() => onRemove(p.id)}>
                  {t("ui.common.delete")}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
