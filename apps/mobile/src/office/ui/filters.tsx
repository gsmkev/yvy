/** Filtros y selectores segmentados. */
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react-native";
import { t } from "@yvy/shared";
import { Pressable, ScrollView, View } from "react-native";
import type { ScrollViewInstance } from "react-native";
import { Text, s as k } from "../../ui/kit";
import { C, F, RADIUS } from "../../ui/theme";

const ARROW_W = 52;

/**
 * Chips de filtro en una fila desplazable. `count` opcional ("Pastura · 3"). Mientras queden chips fuera de
 * la pantalla, un botón con flecha al borde derecho avisa que se desplaza y avanza la fila al tocarlo.
 */
export function FilterChips<V extends string>({ options, value, onChange }: { options: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  const [m, setM] = useState({ x: 0, w: 0, content: 0 });
  // El final de la fila deja libre el ancho de la flecha: así el último chip no queda tapado al llegar al borde.
  const more = m.content - ARROW_W - m.w - m.x > 8 && m.w > 0;
  return (
    <View style={{ marginTop: 16, marginHorizontal: -20 }}>
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={32}
      onLayout={(e) => setM((p) => ({ ...p, w: e.nativeEvent.layout.width }))}
      onContentSizeChange={(content) => setM((p) => ({ ...p, content }))}
      onScroll={(e) => setM((p) => ({ ...p, x: e.nativeEvent.contentOffset.x }))}
      contentContainerStyle={{ paddingLeft: 20, paddingRight: 20 + ARROW_W, gap: 8 }}
    >
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
    {more ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.common.more")}
        onPress={() => ref.current?.scrollTo({ x: m.x + m.w * 0.7, animated: true })}
        style={({ pressed }) => [{ position: "absolute", right: 0, top: 0, bottom: 0, width: ARROW_W, alignItems: "center", justifyContent: "center", backgroundColor: C.papel + "E6" }, pressed && k.pressed]}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.lineaFuerte, alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={18} color={C.tinta} strokeWidth={2} />
        </View>
      </Pressable>
    ) : null}
    </View>
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
            style={{ flex: 1, minHeight: 48, paddingHorizontal: 4, paddingVertical: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.accion : "transparent", borderLeftWidth: i ? 1 : 0, borderLeftColor: C.lineaFuerte }}
          >
            <Text numberOfLines={2} style={{ fontFamily: F.sansMedium, fontSize: options.length > 2 ? 15 : 16, lineHeight: 19, textAlign: "center", color: on ? C.blanco : C.tinta }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
