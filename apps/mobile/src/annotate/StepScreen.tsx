/** Despacho de un paso de pregunta a su componente según el tipo. */
import { t, type ProductDose } from "@yvy/shared";
import type { Season } from "../db/store";
import { getDb } from "../lib/db";
import type { Step } from "../lib/annotate";
import { ChoiceStep } from "./ChoiceStep";
import { ProductsStep } from "./ProductsStep";
import { UsageStep } from "./UsageStep";
import { tr } from "./common";
import { NumberStep, TextStep, YesNoStep } from "./TypedSteps";

/** Dibuja el paso `step` con su control de respuesta; `onAnswer` recibe el valor elegido. */
export function StepScreen({ step, value, answers, prefilled, plotAreaHa, seasons, onAnswer }: { plotAreaHa: number | null; step: Step; value: unknown; answers: Record<string, unknown>; prefilled: boolean; seasons: Season[]; onAnswer: (v: unknown) => void }) {
  if (step.kind === "choice")
    return <ChoiceStep question={tr(step.question)} items={step.options.map((o) => ({ value: o.value, label: tr(o.label) }))} value={value} onAnswer={onAnswer} secondary={step.optional ? t("app.common.skip") : undefined} />;
  if (step.kind === "counter" || step.kind === "paddock" || step.kind === "poi") return null; // se dibuja con HerdCounter (pantalla completa)
  if (step.kind === "season")
    return <ChoiceStep question={tr(step.question)} items={seasons.map((x) => ({ value: x.id, label: x.name }))} value={value} onAnswer={onAnswer} secondary={t("app.common.skip")} />;
  if (step.kind === "catalog") {
    const items = getDb()
      .products()
      .filter((p) => step.productTypes.includes(p.type));
    return <ChoiceStep question={tr(step.question)} items={items.map((p) => ({ value: p.id, label: p.name }))} value={value} onAnswer={onAnswer} secondary={tr(step.otherLabel)} />;
  }
  if (step.kind === "machine")
    return <ChoiceStep question={tr(step.question)} items={getDb().machines().map((m) => ({ value: m.id, label: m.name }))} value={value} onAnswer={onAnswer} secondary={tr(step.otherLabel)} />;
  if (step.kind === "usage") {
    const area = typeof answers.areaHa === "number" ? answers.areaHa : plotAreaHa;
    return <UsageStep question={step.question} hint={step.hint} products={Array.isArray(value) ? (value as ProductDose[]) : []} areaHa={area} onAnswer={onAnswer} />;
  }
  if (step.kind === "products") {
    return <ProductsStep question={step.question} value={value} fixedUnit={step.fixedUnit} types={step.productTypes} onAnswer={onAnswer} />;
  }
  if (step.kind === "yesno") return <YesNoStep step={step} onAnswer={onAnswer} />;
  if (step.kind === "number") return <NumberStep step={step} value={value} answers={answers} prefilled={prefilled} onAnswer={onAnswer} />;
  return <TextStep step={step} value={value} onAnswer={onAnswer} />;
}
