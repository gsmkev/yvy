/** Filtros y selectores segmentados. */
import { Pressable, ScrollView, View } from "react-native";
import { Text, s as k } from "../../ui/kit";
import { C, F, RADIUS } from "../../ui/theme";

/** Chips de filtro en una fila desplazable. `count` opcional ("Pastura · 3"). */
export function FilterChips<V extends string>({ options, value, onChange }: { options: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        const label = o.count === undefined ? o.label : `${o.label} · ${o.count}`;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              onChange(o.value);
            }}
            style={({ pressed }) => [{ minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.accion : C.blanco, borderColor: on ? C.accion : C.lineaFuerte }, pressed && k.pressed]}
          >
            <Text style={{ fontFamily: F.sansMedium, fontSize: 16, color: on ? C.blanco : C.tinta }}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Selector segmentado de 2 a 4 opciones, todas a la vista. */
export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, overflow: "hidden", backgroundColor: C.blanco }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              onChange(o.value);
            }}
            style={{ flex: 1, minHeight: 48, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.accion : "transparent", borderLeftWidth: i ? 1 : 0, borderLeftColor: C.lineaFuerte }}
          >
            <Text numberOfLines={1} style={{ fontFamily: F.sansMedium, fontSize: 16, color: on ? C.blanco : C.tinta }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
