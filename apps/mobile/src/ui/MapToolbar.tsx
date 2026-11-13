import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { C, RADIUS, TOUCH } from "./theme";

/** Barra de herramientas del mapa: una sola columna de íconos de 48 px, pegada al borde derecho. Cada ícono lleva su etiqueta de accesibilidad. */
export function MapToolbar({ children }: { children: ReactNode }) {
  return (
    <View style={st.bar} pointerEvents="box-none">
      {children}
    </View>
  );
}

export function MapToolButton({ icon: Icon, label, onPress, active, rotate, role = "button" }: { icon: LucideIcon; label: string; onPress: () => void; active?: boolean; rotate?: number; role?: "button" | "switch" }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === "switch" ? { checked: !!active } : { expanded: active }}
      onPress={onPress}
      style={({ pressed }) => [st.btn, active && st.btnOn, pressed && { opacity: 0.7 }]}
      // @ts-expect-error title es un atributo de la versión web: tooltip del navegador
      title={label}
    >
      <View style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}>
        <Icon size={22} color={active ? C.blanco : C.tinta} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

/** Panel que se abre al lado de la barra (Capas, Herramientas). Cerrado por defecto: el mapa va despejado. */
export function MapPanel({ children }: { children: ReactNode }) {
  return <View style={st.panel}>{children}</View>;
}

const st = StyleSheet.create({
  bar: { backgroundColor: C.papel, borderRadius: RADIUS + 4, overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  btn: { width: TOUCH - 8, height: TOUCH - 8, alignItems: "center", justifyContent: "center" },
  btnOn: { backgroundColor: C.accion },
  panel: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14, paddingVertical: 4, elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
});
