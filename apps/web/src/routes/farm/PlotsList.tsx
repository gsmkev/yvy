import { LIMITS, staleDaysOrDefault } from "@yvy/shared";
import { LinesPanel } from "../../components/LinesPanel";
import { ExportMenu } from "../../components/menus";
import { PlotsTable } from "../../components/PlotsTable";
import { Select } from "../../components/ui";
import { download, plotsToGeoJson, plotsToKml, plotsToShapefileZip } from "../../lib/exports";
import { areaUnitLabel, fmtAreaValue, fmtDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { tableToCsv, tableToExcel } from "../../lib/tableExport";
import type { FarmDetail, FarmLine, Plot } from "../../lib/types";
import { PoiList } from "./PoiList";

const plotsTable = (plots: Plot[]) => ({
  name: t("ui.plotsFile"),
  headers: [t("ui.plot"), t("ui.kind"), t("ui.crop"), t("ui.season"), t("ui.sowingDate"), "ha", t("ui.lastVisit")],
  rows: plots.map((p) => [
    p.name,
    p.kind === "pasture" ? t("ui.pasture") : t("ui.crop"),
    p.crop ?? p.pastureType,
    p.season,
    p.sowingDate,
    Math.round(p.areaHa * 100) / 100,
    p.lastRecordAt ? fmtDate(p.lastRecordAt) : t("ui.neverVisited"),
  ]),
});

/** Formatos con geometría: solo para quien puede editar. */
const geoFormats = (d: FarmDetail) => [
  {
    label: t("ui.exportFormatKml"),
    run: () => download(new Blob([plotsToKml(d.plots, d.farm.name)], { type: "application/vnd.google-earth.kml+xml" }), `${d.farm.name}.kml`),
  },
  {
    label: t("ui.exportFormatGeojson"),
    run: () => download(new Blob([plotsToGeoJson(d.plots, d.pois)], { type: "application/geo+json" }), `${d.farm.name}.geojson`),
  },
  {
    label: t("ui.exportFormatShapefile"),
    run: async () => download(await plotsToShapefileZip(d.plots, d.pois), `${d.farm.name}-shapefile.zip`),
  },
];

/** Tabla que solo se ve al imprimir la hoja de la estancia. */
function PrintPlots({ plots }: { plots: Plot[] }) {
  return (
    <table className="hidden w-full text-sm print:table">
      <caption className="pb-2 text-left font-serif text-lg font-semibold">{t("ui.printPlotsTitle")}</caption>
      <thead>
        <tr className="border-b border-linea text-left text-xs text-tinta-2">
          <th className="py-1.5 font-medium">{t("ui.plot")}</th>
          <th className="py-1.5 font-medium">{t("ui.crop")}</th>
          <th className="py-1.5 text-right font-medium">{areaUnitLabel()}</th>
          <th className="py-1.5 text-right font-medium">{t("ui.lastVisitShort")}</th>
        </tr>
      </thead>
      <tbody>
        {plots.map((p) => (
          <tr key={p.id} className="border-b border-linea">
            <td className="py-1.5 font-medium">{p.name}</td>
            <td className="py-1.5">{p.kind === "pasture" ? t("ui.pasture") : (p.crop ?? t("ui.crop"))}</td>
            <td className="num py-1.5 text-right">{fmtAreaValue(p.areaHa)}</td>
            <td className="num py-1.5 text-right">{p.lastRecordAt ? fmtDate(p.lastRecordAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PlotsList({
  d,
  farmId,
  canEdit,
  lines,
  shownPlots,
  unvisitedCount,
  onlyUnvisited,
  onToggleUnvisited,
  staleDays,
  onStaleDays,
  onSelect,
  onDrawLine,
  onPoiQr,
  onRemovePoi,
}: {
  d: FarmDetail;
  farmId: string;
  canEdit: boolean;
  lines: FarmLine[] | undefined;
  shownPlots: Plot[];
  unvisitedCount: number;
  onlyUnvisited: boolean;
  onToggleUnvisited: () => void;
  staleDays: number;
  onStaleDays: (n: number) => void;
  onSelect: (id: string) => void;
  onDrawLine: () => void;
  onPoiQr: () => void;
  onRemovePoi: (id: string) => void;
}) {
  return (
    <>
      <PrintPlots plots={shownPlots} />
      <div className="print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-2">
            {unvisitedCount > 0 ? (
              <button
                className="cursor-pointer text-left underline-offset-4 hover:text-surco hover:underline"
                aria-pressed={onlyUnvisited}
                onClick={onToggleUnvisited}
              >
                {onlyUnvisited
                  ? t("ui.unvisitedShowAll")
                  : t(unvisitedCount === 1 ? "ui.unvisitedOneLead" : "ui.unvisitedManyLead", { n: unvisitedCount })}
              </button>
            ) : (
              <span>{t("ui.unvisitedNoneLead")}</span>
            )}
            <Select
              aria-label={t("ui.unvisitedAfter")}
              value={String(staleDays)}
              onChange={(e) => onStaleDays(staleDaysOrDefault(Number(e.target.value)))}
              options={LIMITS.visits.staleDayOptions.map((n) => ({ value: String(n), label: t("ui.daysN", { n }) }))}
              className="[&_select]:h-8 [&_select]:text-sm"
            />
          </div>
          <ExportMenu
            quiet
            formats={[
              { label: t("ui.exportFormatExcel"), run: () => tableToExcel(plotsTable(shownPlots)) },
              { label: t("ui.exportFormatCsv"), run: () => tableToCsv(plotsTable(shownPlots)) },
              ...(canEdit ? geoFormats(d) : []),
            ]}
          />
        </div>
        <PlotsTable plots={shownPlots} onSelect={onSelect} />
        <div className="mt-5">
          <LinesPanel farmId={farmId} lines={lines ?? []} canEdit={canEdit} onDraw={onDrawLine} />
        </div>
        {d.pois.length > 0 && <PoiList pois={d.pois} canEdit={canEdit} onQr={onPoiQr} onRemove={onRemovePoi} />}
      </div>
    </>
  );
}
