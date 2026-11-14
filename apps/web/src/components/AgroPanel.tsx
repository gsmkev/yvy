import type { Plot, Poi } from "../lib/types";
import { BufferPanel } from "./BufferPanel";
import { DeliveriesPanel } from "./DeliveriesPanel";
import { FertilityPanel } from "./FertilityPanel";
import { SoilPanel } from "./SoilPanel";
import { SowingPlan } from "./SowingPlan";
import { SowingWindow } from "./SowingWindow";
import { WithdrawalPanel } from "./WithdrawalPanel";

/** Pestaña Agronomía de la estancia: planificación y control agrícola (solo para quien edita el campo). */
export function AgroPanel({ farmId, plots, pois }: { farmId: string; plots: Plot[]; pois: Poi[] }) {
  return (
    <div className="flex flex-col gap-6 [&>section+section]:border-t [&>section+section]:border-linea [&>section+section]:pt-6">
      <SowingPlan farmId={farmId} plots={plots} />
      <SowingWindow farmId={farmId} />
      <WithdrawalPanel farmId={farmId} />
      <BufferPanel farmId={farmId} plots={plots} pois={pois} />
      <SoilPanel farmId={farmId} plots={plots} />
      <FertilityPanel farmId={farmId} />
      <DeliveriesPanel farmId={farmId} plots={plots} />
    </div>
  );
}
