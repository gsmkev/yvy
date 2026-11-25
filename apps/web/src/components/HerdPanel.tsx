/** Pestaña Hacienda: hacienda calculada por potrero, carga animal y límite configurable. */
import { useState } from "react";
import { SYSTEM_SECTION_ORDER } from "@yvy/shared";
import { t } from "../lib/i18n";
import { ForagePanel } from "./ForagePanel";
import { RotationPanel } from "./RotationPanel";
import { AnimalsPanel } from "./AnimalsPanel";
import { BreedingPlanPanel } from "./BreedingPlanPanel";
import { ReproPanel } from "./ReproPanel";
import { SupplementPanel } from "./SupplementPanel";
import { TheftPanel } from "./TheftPanel";
import { WeighingsPanel } from "./WeighingsPanel";
import { SystemBar, SystemIndicators, useSystem } from "./HerdSystem";
import { StockSection } from "./herd/StockSection";
import { Tabs } from "./ui";

type Section = "stock" | "plan" | "rotation" | "forage" | "animals" | "repro" | "weights" | "supplements" | "theft";

/** Pestaña Hacienda: hacienda calculada y, abajo, cada módulo de ganadería en su sección. */
export function HerdPanel({ farmId }: { farmId: string }) {
  const [section, setSection] = useState<Section>("stock");
  const system = useSystem(farmId).data ?? null;
  const first: readonly string[] = system ? SYSTEM_SECTION_ORDER[system] : [];
  const rank = (id: string) => (id === "stock" ? -1 : first.includes(id) ? first.indexOf(id) : first.length);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <SystemBar farmId={farmId} system={system} />
      <SystemIndicators farmId={farmId} system={system} />
      <Tabs
        variant="pill"
        label={t("ui.herd.sections")}
        value={section}
        onChange={setSection}
        tabs={([
          { id: "stock", label: t("ui.herd.sectionStock") },
          { id: "rotation", label: t("ui.herd.sectionRotation") },
          { id: "forage", label: t("ui.herd.sectionForage") },
          { id: "animals", label: t("ui.herd.sectionAnimals") },
          { id: "plan", label: t("ui.repro.planSection") },
          { id: "repro", label: t("ui.herd.sectionRepro") },
          { id: "weights", label: t("ui.herd.sectionWeights") },
          { id: "supplements", label: t("ui.herd.sectionSupp") },
          { id: "theft", label: t("ui.herd.sectionTheft") },
        ] as { id: Section; label: string }[]).sort((a, b) => rank(a.id) - rank(b.id))}
      />
      {section === "stock" && <StockSection farmId={farmId} />}
      {section === "rotation" && <RotationPanel farmId={farmId} />}
      {section === "forage" && <ForagePanel farmId={farmId} />}
      {section === "animals" && <AnimalsPanel farmId={farmId} />}
      {section === "plan" && <BreedingPlanPanel farmId={farmId} />}
      {section === "repro" && <ReproPanel farmId={farmId} />}
      {section === "weights" && <WeighingsPanel farmId={farmId} />}
      {section === "supplements" && <SupplementPanel farmId={farmId} />}
      {section === "theft" && <TheftPanel farmId={farmId} />}
    </div>
  );
}
