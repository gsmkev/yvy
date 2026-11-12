/**
 * Buscar un animal por caravana (G-21): ficha e historial con lo que bajó al celular, también sin señal.
 * Los animales se cargan desde la web; acá solo se consultan.
 */
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { describeRecord, normalizeTag, t, weightSeries, type MessageKey, type WeightPoint } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { useLocal } from "../src/lib/useLocal";
import { Row, s as k, Text, TextInput } from "../src/ui/kit";
import { C, RADIUS, T } from "../src/ui/theme";

const when = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short", year: "numeric" });

export default function Animals() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const total = useLocal(() => getDb().animals("", 1).length);
  const found = useLocal(() => getDb().animals(query), [query]);
  const animal = found.find((a) => a.id === selected) ?? null;
  const history = useLocal(() => (animal ? getDb().recordsOfTag(animal.tag) : []), [animal?.tag]);
  const adg = useMemo(() => {
    const pts: WeightPoint[] = [];
    for (const r of history) {
      if (r.kind !== "weighing") continue;
      const d = JSON.parse(r.data) as { kg?: number };
      if (typeof d.kg === "number") pts.push({ at: r.capturedAt, kg: d.kg, head: 1 });
    }
    return pts.length > 1 ? weightSeries("a", null, pts).adgKg : null;
  }, [history]);

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 80 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.animalsTitle")}</Text>
      <TextInput
        value={query}
        onChangeText={(v) => {
          setQuery(normalizeTag(v).slice(0, 20));
          setSelected(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t("app.animalsSearch")}
        placeholderTextColor={C.tinta3}
        accessibilityLabel={t("app.animalsSearch")}
        style={st.input}
      />
      {total === 0 && <Text style={[T.small, { marginTop: 16 }]}>{t("app.animalsNone")}</Text>}
      {total > 0 && found.length === 0 && <Text style={[T.small, { marginTop: 16 }]}>{t("app.animalsNoMatch")}</Text>}
      {found.map((a) => (
        <Row
          key={a.id}
          title={a.tag}
          subtitle={`${t(`fields.herd_${a.category}` as MessageKey)} · ${t(`fields.sex_${a.sex}` as MessageKey)}`}
          selected={selected === a.id}
          onPress={() => setSelected(a.id)}
        />
      ))}
      {animal && (
        <View style={{ marginTop: 24 }}>
          <Text style={T.heading}>{animal.tag}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>
            {[
              t(`fields.herd_${animal.category}` as MessageKey),
              t(`fields.sex_${animal.sex}` as MessageKey),
              animal.birthDate ? t("app.animalsBorn", { date: animal.birthDate.split("-").reverse().join("/") }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {animal.note ? <Text style={[T.body, { marginTop: 6 }]}>{animal.note}</Text> : null}
          {adg !== null && <Text style={[T.bodyMedium, { marginTop: 10 }]}>{t("app.animalsAdg", { v: adg.toFixed(2).replace(".", ",") })}</Text>}
          <Text style={[T.heading, { marginTop: 20, marginBottom: 4 }]}>{t("app.animalsHistory")}</Text>
          {history.length === 0 && <Text style={T.small}>{t("app.animalsNoHistory")}</Text>}
          {history.map((r) => (
            <Row
              key={r.id}
              title={t(`recordKinds.${r.kind}` as MessageKey)}
              subtitle={`${when(r.capturedAt)} · ${describeRecord(r.kind, JSON.parse(r.data))}`}
            />
          ))}
          <Text style={[T.small, { marginTop: 12, color: C.tinta3 }]}>{t("app.animalsHistoryNote")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  input: {
    marginTop: 16,
    minHeight: 56,
    borderWidth: 1,
    borderColor: C.lineaFuerte,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    fontSize: 20,
    color: C.tinta,
    backgroundColor: C.blanco,
  },
});
