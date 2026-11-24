import { ScrollView, View } from "react-native";
import { t, type HerdCounts } from "@yvy/shared";
import { selectedFarmId } from "../lib/farmFilter";
import { HerdCounter } from "../ui/Counter";
import { Button, RadioGroup, Row, s as k, Text } from "../ui/kit";
import { T } from "../ui/theme";
import { AnnotateHeader } from "./Header";
import { Progress } from "./Progress";
import { StepScreen } from "./StepScreen";
import { seedFor, tr } from "./common";
import type { AnnotateState } from "./useAnnotate";

/** 3. Pasos: una pregunta por pantalla según el tipo de paso. */
export function StepsScreen({ a, i }: { a: AnnotateState; i: number }) {
  const { db, steps, kind, plot, editing, values, setValues, advance, waterPois, sprayPre, seasons } = a;
  const step = steps[i]!;
  if (step.kind === "counter")
    return (
      <View style={k.screen}>
        <AnnotateHeader a={a} />
        <Progress i={i} n={steps.length + 1} />
        <HerdCounter
          key={`${kind}-${step.key}`}
          question={tr(step.question)}
          hint={step.hint ? tr(step.hint) : undefined}
          counts={(values[step.key] as HerdCounts | undefined) ?? seedFor(kind, plot, editing)}
          onChange={(c) => setValues((v) => ({ ...v, [step.key]: c }))}
          onDone={(c) => advance({ ...values, [step.key]: c })}
        />
      </View>
    );
  if (step.kind === "poi")
    return (
      <View style={k.screen}>
        <AnnotateHeader a={a} />
        <Progress i={i} n={steps.length + 1} />
        <ScrollView contentContainerStyle={k.pad}>
          <Text style={[T.title, { marginBottom: 16 }]}>{tr(step.question)}</Text>
          <RadioGroup label={tr(step.question)}>
            {waterPois.map((p) => (
              <Row key={p.id} choice="radio" title={p.name} selected={values[step.key] === p.id} onPress={() => advance({ ...values, [step.key]: p.id })} />
            ))}
          </RadioGroup>
          <Button kind="text" title={t("app.waterPoiOther")} onPress={() => advance({ ...values, [step.key]: undefined })} style={{ marginTop: 12 }} />
        </ScrollView>
      </View>
    );
  if (step.kind === "paddock")
    return (
      <View style={k.screen}>
        <AnnotateHeader a={a} />
        <Progress i={i} n={steps.length + 1} />
        <ScrollView contentContainerStyle={k.pad}>
          <Text style={[T.title, { marginBottom: 16 }]}>{tr(step.question)}</Text>
          <RadioGroup label={tr(step.question)}>
            {db
              .plots(plot?.farmId ?? selectedFarmId(db) ?? undefined)
              .filter((p) => p.kind === "pasture" && p.id !== plot?.id)
              .map((p) => (
                <Row key={p.id} choice="radio" title={p.name} selected={values[step.key] === p.id} onPress={() => advance({ ...values, [step.key]: p.id })} />
              ))}
          </RadioGroup>
        </ScrollView>
      </View>
    );
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <Progress i={i} n={steps.length + 1} />
      <StepScreen key={`${kind}-${step.kind}-${step.key}`} plotAreaHa={plot?.areaHa ?? null} step={step} value={values[step.key]} answers={values} prefilled={!editing && kind === "application" && !!sprayPre && values[step.key] !== undefined && (sprayPre as Record<string, unknown>)[step.key] === values[step.key]} seasons={seasons} onAnswer={(v) => advance({ ...values, [step.key]: v })} />
    </View>
  );
}
