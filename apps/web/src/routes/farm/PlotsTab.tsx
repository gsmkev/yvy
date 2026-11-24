import { EmptyState, Button } from "../../components/ui";
import { PlotPanel } from "../../components/PlotPanel";
import { t } from "../../lib/i18n";
import type { FarmDetail, FarmLine, Member, ProblemArea } from "../../lib/types";
import { PlotsList } from "./PlotsList";
import type { FarmEditing } from "./useFarmEditing";

type ListProps = Parameters<typeof PlotsList>[0];

export interface PlotsTabProps {
  d: FarmDetail;
  farmId: string;
  canEdit: boolean;
  edit: FarmEditing;
  plot: FarmDetail["plots"][number] | undefined;
  members: Member[] | undefined;
  problems: ProblemArea[] | undefined;
  lines: FarmLine[] | undefined;
  list: Pick<ListProps, "shownPlots" | "unvisitedCount" | "onlyUnvisited" | "onToggleUnvisited" | "staleDays" | "onStaleDays" | "onRemovePoi">;
  onSelect: (id: string | null) => void;
  onShowArea: (a: ProblemArea) => void;
}

/** Pestaña Lotes: ficha del lote elegido, estado vacío o la lista con exportes, líneas y puntos. */
export function PlotsTab({ d, farmId, canEdit, edit, plot, members, problems, lines, list, onSelect, onShowArea }: PlotsTabProps) {
  if (plot)
    return (
      <PlotPanel
        key={plot.id}
        plot={plot}
        farm={d.farm}
        workers={(members ?? []).filter((m) => d.assignments.some((a) => a.plotId === plot.id && a.userId === m.userId))}
        canEdit={canEdit}
        onClose={() => {
          onSelect(null);
          // Al volver a la lista, el foco queda en la pestaña activa y no se pierde en el vacío
          setTimeout(() => document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(), 0);
        }}
        problemAreas={(problems ?? []).filter((a) => a.plotId === plot.id)}
        onShowArea={onShowArea}
        onSplit={() => {
          edit.setMergeFrom(null);
          edit.setSplitting(plot.id);
        }}
        onMerge={() => {
          edit.setSplitting(null);
          edit.setMergeFrom(plot.id);
        }}
        onEditShape={() => {
          edit.setShape(null);
          edit.setShapeEdit({ id: plot.id, geometry: plot.geometry });
        }}
      />
    );
  if (d.plots.length === 0)
    return (
      <EmptyState
        title={t("ui.noPlotsTitle")}
        action={
          canEdit && (
            <Button variant="primary" onClick={() => edit.setMode("draw")}>
              {t("ui.newPlot")}
            </Button>
          )
        }
      >
        {t("ui.noPlotsHelp")}
      </EmptyState>
    );
  return (
    <PlotsList
      d={d}
      farmId={farmId}
      canEdit={canEdit}
      lines={lines}
      onSelect={onSelect}
      onDrawLine={() => edit.setLineDraw(true)}
      onPoiQr={() => edit.setPoiQr(true)}
      {...list}
    />
  );
}
