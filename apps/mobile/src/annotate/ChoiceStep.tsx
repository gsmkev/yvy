import { useState } from "react";
import { t } from "@yvy/shared";
import { Button, RadioGroup, Row, ScreenBody, Text } from "../ui/kit";
import { T } from "../ui/theme";

/** Paso de elegir una opción: se marca la fila, "Seguir" queda fijo abajo y lo que no aplica ("Omitir", "Otro") es la acción secundaria. */
export function ChoiceStep({ question, items, value, onAnswer, secondary }: { question: string; items: { value: string; label: string }[]; value: unknown; onAnswer: (v: unknown) => void; secondary?: string }) {
  const [picked, setPicked] = useState<string | undefined>(typeof value === "string" ? value : undefined);
  return (
    <ScreenBody
      footer={
        <>
          <Button big title={t("app.next")} disabled={picked === undefined} onPress={() => onAnswer(picked)} />
          {secondary ? <Button kind="secondary" title={secondary} onPress={() => onAnswer(undefined)} /> : null}
        </>
      }
    >
      <Text style={[T.title, { marginBottom: 16 }]}>{question}</Text>
      <RadioGroup label={question}>
        {items.map((o) => (
          <Row key={o.value} choice="radio" title={o.label} selected={picked === o.value} onPress={() => setPicked(o.value)} />
        ))}
      </RadioGroup>
    </ScreenBody>
  );
}
