/** Pestañas del panel de la estancia. */
import { AgroPanel } from "../../components/AgroPanel";
import { AlertsList } from "../../components/AlertsList";
import { ClimatePanel } from "../../components/ClimatePanel";
import { HerdPanel } from "../../components/HerdPanel";
import { ProductsPanel } from "../../components/ProductsPanel";
import { RecordsList } from "../../components/RecordsList";
import { SeasonsPanel } from "../../components/SeasonsPanel";
import { TasksPanel } from "../../components/TasksPanel";
import type { FarmDetail, RecordRow } from "../../lib/types";
import type { TaskPicking } from "./useFarmEditing";
import { PlotsTab, type PlotsTabProps } from "./PlotsTab";

/** Pestañas del panel de la estancia. */
export type Tab = "plots" | "seasons" | "products" | "records" | "tasks" | "climate" | "alerts" | "herd" | "agro";
/** Pestañas en el orden en que se muestran. */
export const TABS: Tab[] = ["plots", "seasons", "products", "records", "tasks", "climate", "alerts", "herd", "agro"];

/** Contenido de la pestaña activa del panel de la estancia. */
export function TabBody({
  tab,
  d,
  farmId,
  canEdit,
  task,
  onRows,
  plots,
}: {
  tab: Tab;
  d: FarmDetail;
  farmId: string;
  canEdit: boolean;
  task: TaskPicking;
  onRows: (rows: RecordRow[]) => void;
  plots: PlotsTabProps;
}) {
  switch (tab) {
    case "plots":
      return (
        <PlotsTab
          d={plots.d}
          farmId={plots.farmId}
          canEdit={plots.canEdit}
          edit={plots.edit}
          plot={plots.plot}
          members={plots.members}
          problems={plots.problems}
          lines={plots.lines}
          list={plots.list}
          onSelect={plots.onSelect}
          onShowArea={plots.onShowArea}
        />
      );
    case "seasons":
      return <SeasonsPanel farmId={farmId} plots={d.plots} canEdit={canEdit} />;
    case "products":
      return <ProductsPanel canEdit={canEdit} farmId={farmId} plots={d.plots} />;
    case "records":
      return <RecordsList filters={{ farmId }} onRows={onRows} />;
    case "tasks":
      return (
        <TasksPanel
          farmId={farmId}
          plots={d.plots}
          pick={{ ids: task.taskPlots, setIds: task.setTaskPlots, picking: task.picking, setPicking: task.setPicking }}
        />
      );
    case "climate":
      return <ClimatePanel farmId={farmId} />;
    case "alerts":
      return <AlertsList farmId={farmId} />;
    case "herd":
      return canEdit ? <HerdPanel farmId={farmId} /> : null;
    case "agro":
      return canEdit ? <AgroPanel farmId={farmId} plots={d.plots} pois={d.pois} /> : null;
  }
}
