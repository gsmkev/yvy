/** Ficha del lote seleccionado en el mapa: datos, edición y secciones agronómicas. */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { centroidOf, type Area } from "@yvy/geo";
import { del } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import type { FarmDetail } from "../lib/types";
import { fmtHa } from "../lib/format";
import { Pencil, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import type { Farm, Member, Plot, ProblemArea } from "../lib/types";
import { CopyCoords } from "./CopyCoords";
import { PlotAgro } from "./PlotAgro";
import { PlotResults } from "./PlotResults";
import { SamplingGrid } from "./SamplingGrid";
import { VigorSeasons } from "./VigorSeasons";
import { Button, ConfirmModal, ErrorBox, Spinner } from "./ui";
import { NdviSection } from "./plot/NdviSection";
import { PlotEditForm } from "./plot/PlotEditForm";
import { ProblemAreasSection } from "./plot/ProblemAreasSection";
import { RotationSection } from "./plot/RotationSection";
import { usePlotForm, usePlotHistory, usePlotNdvi, useProblemTask } from "./plot/usePlotData";

/**
 * Panel lateral con la ficha de un lote.
 * @param workers personas a las que se puede asignar una tarea.
 */
export function PlotPanel({
  plot,
  workers,
  canEdit,
  onClose,
  problemAreas = [],
  onShowArea,
  onEditShape,
  onSplit,
  onMerge,
  farm,
}: {
  plot: Plot;
  workers: Member[];
  /** Habilita editar el lote. */
canEdit: boolean;
  onClose: () => void;
  /** Áreas problema de este lote. */
  problemAreas?: ProblemArea[];
  /** Centra el mapa en un área problema. */
onShowArea?: (a: ProblemArea) => void;
  /** Pasa el mapa a edición de vértices de este lote. */
  onEditShape?: () => void;
  /** Dibujar una línea para dividir el lote / elegir otro lote para unir. */
  onSplit?: () => void;
  /** Empieza a unir el lote con otro contiguo. */
onMerge?: () => void;
  /** Estancia del lote (encabezado de la grilla de muestreo). */
  farm?: Farm;
}) {
  const qc = useQueryClient();
  const centroid = centroidOf(JSON.parse(plot.geometry) as Area);
  const heading = useRef<HTMLHeadingElement>(null);
  // Al abrir la ficha el foco pasa al título, para que el lector de pantalla anuncie el lote
  useEffect(() => heading.current?.focus(), []);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const plotForm = usePlotForm(plot, () => setEditing(false));
  const ndvi = usePlotNdvi(plot, canEdit);
  const history = usePlotHistory(plot);
  const problemTask = useProblemTask(plot, workers);
  const remove = () => {
    deleteWithUndo({
      qc,
      id: plot.id,
      message: t("ui.toast.plotDeleted"),
      hide: () =>
        qc.setQueryData<FarmDetail>(
          ["farm", plot.farmId],
          (d) => d && { ...d, plots: d.plots.filter((p) => p.id !== plot.id) },
        ),
      request: () => del(`/org/plots/${plot.id}`),
      invalidate: [["farm", plot.farmId], ["farms"]],
    });
    onClose();
  };
  return (
    <div className="flex flex-col gap-5">
      <div>
        <button
          onClick={onClose}
          className="cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline print:hidden"
        >
          ← {t("ui.all.plots")}
        </button>
        <h2 ref={heading} tabIndex={-1} className="mt-3 font-serif text-[24px] leading-tight font-semibold outline-none">
          {plot.name}
        </h2>
        <p className="num mt-1 text-sm text-tinta-2">
          {plot.kind === "pasture" ? t("ui.common.pasture") : (plot.crop ?? t("ui.common.crop"))}, {fmtHa(plot.areaHa)}
          {plot.season ? `, ${plot.season}` : ""}
        </p>
        <p className="mt-1 text-sm text-tinta-2">
          {workers.length
            ? `${t("ui.common.assignedTo")} ${workers.map((w) => w.fullName).join(", ")}`
            : t("ui.common.nobodyAssigned")}
        </p>
        <CopyCoords className="mt-2" lon={centroid.lon} lat={centroid.lat} />
      </div>

      {canEdit && ndvi.isLoading && <Spinner />}
      {canEdit && ndvi.data && <NdviSection plot={plot} data={ndvi.data} />}
      {canEdit && <SamplingGrid plot={plot} farm={farm} />}
      {canEdit && <VigorSeasons plotId={plot.id} farmId={plot.farmId} />}
      {ndvi.error && <ErrorBox error={ndvi.error} />}

      {canEdit && problemAreas.length > 0 && (
        <ProblemAreasSection workers={workers} problemAreas={problemAreas} task={problemTask} onShowArea={onShowArea} />
      )}

      {plot.kind === "crop" && <RotationSection history={history} />}

      {canEdit && <PlotResults plot={plot} />}

      {canEdit && <PlotAgro plot={plot} />}

      {canEdit && !editing && (
        <div className="flex flex-wrap gap-2 border-t border-linea pt-4">
          <Button icon={Pencil} onClick={() => setEditing(true)}>
            {t("ui.common.edit")}
          </Button>
          {onEditShape && (
            <Button onClick={onEditShape}>{t("ui.plot.editShape")}</Button>
          )}
          {onSplit && JSON.parse(plot.geometry).type === "Polygon" && (
            <Button onClick={onSplit}>{t("ui.split.plot")}</Button>
          )}
          {onMerge && JSON.parse(plot.geometry).type === "Polygon" && (
            <Button onClick={onMerge}>{t("ui.merge.plots")}</Button>
          )}
          <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
            {t("ui.common.delete")}
          </Button>
        </div>
      )}
      {editing && <PlotEditForm f={plotForm} onCancel={() => setEditing(false)} />}
      {confirming && (
        <ConfirmModal
          title={plot.name}
          message={t("ui.confirm.delete", { name: plot.name })}
          confirmLabel={t("ui.common.delete")}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
