/** Campos de formulario y la hoja que los contiene. */
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { t, displayToIso, isoToDisplay, maskDate } from "@yvy/shared";
import { tap } from "../../lib/haptics";
import { Button, ChoiceSheet, Sheet, Text, TextInput } from "../../ui/kit";
import { C, F, RADIUS, T, TOUCH } from "../../ui/theme";


/** Rótulo + control + ayuda o error. Los demás campos (TextField, SelectField, DateField) ya lo usan. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[T.smallMedium, { marginBottom: 6 }]}>{label}</Text>
      {children}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[T.small, { color: C.peligro, marginTop: 4 }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[T.small, { marginTop: 4 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const inputBox = (error?: string) =>
  ({
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderColor: error ? C.peligro : C.lineaFuerte,
    borderRadius: RADIUS,
    backgroundColor: C.blanco,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  }) as const;

const inputText = { flex: 1, fontFamily: F.sans, fontSize: 17, color: C.tinta, paddingVertical: 12 } as const;

export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  kind = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  error?: string;
  /** "number" = entero (teclado numérico); "decimal" = con coma o punto (usá parseDecimal de format.ts); "multiline" = varias líneas. */
  kind?: "text" | "number" | "decimal" | "multiline";
} & Pick<ComponentProps<typeof TextInput>, "placeholder" | "maxLength" | "autoCapitalize" | "secureTextEntry" | "editable">) {
  const keyboardType = kind === "number" ? "number-pad" : kind === "decimal" ? "decimal-pad" : "default";
  return (
    <Field label={label} hint={hint} error={error}>
      <View style={inputBox(error)}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={kind === "multiline"}
          placeholderTextColor={C.tinta3}
          style={[inputText, kind === "multiline" && { minHeight: 96, textAlignVertical: "top" }]}
          {...rest}
        />
      </View>
    </Field>
  );
}

/** Campo que abre una hoja (`ChoiceSheet`) con las opciones. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  hint,
  error,
}: {
  label: string;
  value: V | null | undefined;
  options: { value: V; label: string; hint?: string }[];
  onChange: (v: V) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? t("office.selectPlaceholder")}`}
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={inputBox(error)}
      >
        <Text style={[inputText, !current && { color: C.tinta3 }]} numberOfLines={1}>
          {current?.label ?? placeholder ?? t("office.selectPlaceholder")}
        </Text>
        <ChevronDown size={22} color={C.tinta3} strokeWidth={2} />
      </Pressable>
      <ChoiceSheet
        visible={open}
        title={label}
        value={value ?? undefined}
        options={options}
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </Field>
  );
}

/**
 * Fecha como texto dd/mm/aaaa con máscara. `value` e `onChange` son ISO (aaaa-mm-dd); `onChange("")` mientras la
 * fecha está incompleta o no existe (31/02). Muestra "Fecha inválida" cuando están los 10 caracteres y no es una fecha.
 */
export function DateField({ label, value, onChange, hint, error }: { label: string; value: string; onChange: (iso: string) => void; hint?: string; error?: string }) {
  const [text, setText] = useState(isoToDisplay(value));
  // Si el valor cambia desde afuera (p. ej. al abrir un formulario con datos), se refleja; lo que se está tipeando no se pisa.
  useEffect(() => {
    if ((displayToIso(text) ?? "") !== value) setText(isoToDisplay(value));
  }, [value]);
  const invalid = text.length === 10 && displayToIso(text) === null;
  return (
    <Field label={label} hint={hint ?? t("office.datePlaceholder")} error={error ?? (invalid ? t("office.invalidDate") : undefined)}>
      <View style={inputBox(error ?? (invalid ? "x" : undefined))}>
        <TextInput
          accessibilityLabel={label}
          value={text}
          keyboardType="number-pad"
          maxLength={10}
          placeholder={t("office.datePlaceholder")}
          placeholderTextColor={C.tinta3}
          style={inputText}
          onChangeText={(raw) => {
            const masked = maskDate(raw);
            setText(masked);
            onChange(displayToIso(masked) ?? "");
          }}
        />
      </View>
    </Field>
  );
}

/** Formulario en una hoja inferior (sube con el teclado). El botón principal dice `submitLabel`; `error` va arriba del botón. */
export function FormSheet({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  pending,
  error,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose} avoidKeyboard>
      {children}
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>
          {error}
        </Text>
      ) : null}
      <Button title={submitLabel} onPress={onSubmit} loading={pending} style={{ marginTop: 20 }} />
      <Button kind="text" title={t("ui.cancel")} onPress={onClose} disabled={pending} style={{ marginTop: 4 }} />
    </Sheet>
  );
}
