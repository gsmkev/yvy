/** Hojas inferiores y selector de una opción. */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Modal, View } from "react-native";
import { Check } from "lucide-react-native";
import { t } from "@yvy/shared";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, T } from "../theme";
import { useReduceMotion } from "./motion";
import { RadioGroup } from "./layout";
import { Row, Text } from "./controls";
import { s } from "./styles";

/** Hoja inferior: sube desde abajo, se cierra tocando afuera o con atrás. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  avoidKeyboard,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sube la hoja cuando se abre el teclado (para hojas con campos de texto). */
  avoidKeyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={s.sheetRoot} behavior={avoidKeyboard ? "padding" : undefined} enabled={!!avoidKeyboard}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("ui.common.cancel")} style={s.sheetBackdrop} onPress={onClose} />
        <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <View style={s.sheetGrip} />
          <Text accessibilityRole="header" style={[T.heading, { marginBottom: 8 }]}>
            {title}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Hoja con una lista de opciones de una sola respuesta (reemplaza a `Alert.alert` como selector). */
export function ChoiceSheet<V extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: V; label: string; hint?: string }[];
  value?: V;
  onSelect: (v: V) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <RadioGroup label={title}>
        {options.map((o) => (
          <Row
            key={o.value}
            choice="radio"
            title={o.label}
            subtitle={o.hint}
            selected={o.value === value}
            onPress={() => {
              onSelect(o.value);
            }}
            right={o.value === value ? <Check size={22} color={C.accionOscuro} strokeWidth={2.5} /> : undefined}
          />
        ))}
      </RadioGroup>
    </Sheet>
  );
}
