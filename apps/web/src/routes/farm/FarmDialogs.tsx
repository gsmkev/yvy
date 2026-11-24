import { useQueryClient } from "@tanstack/react-query";
import { ImportPlots } from "../../components/ImportPlots";
import { NewLineModal } from "../../components/LinesPanel";
import { MergeModal, SplitModal } from "../../components/PlotEditModals";
import { PoiQrModal } from "../../components/PoiQr";
import { toast } from "../../components/ui";
import { t } from "../../lib/i18n";
import type { FarmDetail } from "../../lib/types";
import { NewPlotModal, NewPoiModal } from "./modals";
import type { FarmEditing } from "./useFarmEditing";

/** Diálogos de la estancia: línea nueva, dividir, unir, QR de puntos, importar y alta de lote o punto. */
export function FarmDialogs({
  d,
  farmId,
  edit,
  onSelect,
}: {
  d: FarmDetail;
  farmId: string;
  edit: FarmEditing;
  onSelect: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const { splitting, splitLine, mergeFrom, mergeWith } = edit;
  const splitPlot = d.plots.find((p) => p.id === splitting);
  const mergeA = d.plots.find((p) => p.id === mergeFrom);
  const mergeB = d.plots.find((p) => p.id === mergeWith);
  const refreshFarm = () => {
    qc.invalidateQueries({ queryKey: ["farm", farmId] });
    qc.invalidateQueries({ queryKey: ["farms"] });
  };
  return (
    <>
      {edit.newLine && (
        <NewLineModal
          farmId={farmId}
          line={edit.newLine}
          onClose={() => {
            edit.setNewLine(null);
            edit.setLineDraw(false);
          }}
        />
      )}
      {splitting && splitLine && splitPlot && (
        <SplitModal
          plot={splitPlot}
          line={splitLine}
          onClose={() => {
            edit.setSplitLine(null);
            edit.setSplitting(null);
          }}
          onDone={() => {
            edit.setSplitLine(null);
            edit.setSplitting(null);
            onSelect(null);
            refreshFarm();
            toast(t("ui.split.done"));
          }}
        />
      )}
      {mergeFrom && mergeWith && mergeA && mergeB && (
        <MergeModal
          a={mergeA}
          b={mergeB}
          onClose={() => {
            edit.setMergeWith(null);
            edit.setMergeFrom(null);
          }}
          onDone={() => {
            edit.setMergeWith(null);
            edit.setMergeFrom(null);
            onSelect(null);
            refreshFarm();
            toast(t("ui.merge.done"));
          }}
        />
      )}
      {edit.poiQr && <PoiQrModal farmName={d.farm.name} pois={d.pois} onClose={() => edit.setPoiQr(false)} />}
      {edit.mode === "import" && <ImportPlots farmId={farmId} onClose={() => edit.setMode("none")} />}
      {edit.drawn && (
        <NewPlotModal
          farmId={farmId}
          geometry={edit.drawn}
          onClose={() => edit.setDrawn(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["farm", farmId] })}
        />
      )}
      {edit.poiAt && (
        <NewPoiModal
          farmId={farmId}
          at={edit.poiAt}
          onClose={() => edit.setPoiAt(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["farm", farmId] })}
        />
      )}
    </>
  );
}
