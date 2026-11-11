/** Historial: 30 días agrupados por día. Lo pendiente de mandar se distingue por el color del punto. */
import { useState } from "react";
import { Image, Pressable, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { describeRecord, LIMITS, t, type RecordKind } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { useLocal } from "../../src/lib/useLocal";
import { Row, s as k, Text } from "../../src/ui/kit";
import { C, F, T } from "../../src/ui/theme";

const dayKey = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const dayTitle = (key: string) => {
  const today = dayKey(Date.now());
  if (key === today) return t("app.today");
  if (key === dayKey(Date.now() - 86_400_000)) return t("app.yesterday").replace(/^./, (c) => c.toUpperCase());
  const d = new Date(`${key}T12:00:00-03:00`);
  const txt = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function History() {
  const { farmId } = useFarmChoice();
  const records = useLocal(() => byFarm(getDb().records(), farmId), [farmId]);
  const plots = useLocal(() => getDb().plots());
  const thumbs = useLocal(() => getDb().firstThumbByRecord());
  const [filter, setFilter] = useState<RecordKind | "all">("all");
  // Solo se ofrecen los tipos que hay en el historial.
  const kinds = [...new Set(records.map((r) => r.kind))];
  const active = filter !== "all" && kinds.includes(filter) ? filter : "all";
  const shown = active === "all" ? records : records.filter((r) => r.kind === active);
  const sections = Object.entries(
    shown.reduce<Record<string, typeof records>>((acc, r) => {
      (acc[dayKey(r.capturedAt)] ??= []).push(r);
      return acc;
    }, {}),
  ).map(([key, data]) => ({ title: dayTitle(key), data }));

  return (
    <SectionList
      style={k.screen}
      contentContainerStyle={[k.pad, { paddingBottom: 120 }]}
      sections={sections}
      keyExtractor={(r) => r.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View>
          <Text style={[T.display, { marginBottom: 8 }]}>{t("app.history")}</Text>
          {kinds.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filters} contentContainerStyle={{ gap: 22 }}>
              {(["all", ...kinds] as const).map((kd) => (
                <Pressable
                  key={kd}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active === kd }}
                  onPress={() => setFilter(kd)}
                  style={[st.filter, active === kd && st.filterActive]}
                >
                  <Text style={[T.bodyMedium, { color: active === kd ? C.tinta : C.tinta2 }]}>{kd === "all" ? t("app.filterAll") : t(`recordKinds.${kd}`)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={{ paddingVertical: 32 }}>
          <Text style={T.heading}>{t("app.noRecordsYet")}</Text>
          <Text style={[T.small, { marginTop: 4 }]}>{t("app.noRecordsHint")}</Text>
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={st.day}>{section.title}</Text>}
      renderItem={({ item: r }) => (
        <Row
          title={describeRecord(r.kind, JSON.parse(r.data))}
          subtitle={[t(`recordKinds.${r.kind}`), plots.find((p) => p.id === r.plotId)?.name, hhmm(r.capturedAt)].filter(Boolean).join(" · ")}
          onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
          left={<View style={[st.dot, { backgroundColor: r.rejected ? C.peligro : r.pending ? C.trigo : C.accion }]} />}
          right={
            r.rejected ? (
              <Text style={[T.small, { color: C.peligro }]}>{t("app.rejected")}</Text>
            ) : r.photos > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {r.photos > 1 && <Text style={T.small}>{r.photos}</Text>}
                {thumbs.get(r.id) ? <Image source={{ uri: thumbs.get(r.id)! }} style={st.thumb} accessibilityLabel={t("app.photosCount", { n: r.photos, max: LIMITS.photos.maxPerRecord })} /> : <Text style={T.small}>{r.photos}</Text>}
              </View>
            ) : undefined
          }
        />
      )}
    />
  );
}

const st = StyleSheet.create({
  day: { fontFamily: F.sansSemi, fontSize: 15, color: C.tinta2, marginTop: 28, marginBottom: 4 },
  filters: { marginHorizontal: -20, paddingHorizontal: 20, flexGrow: 0 },
  filter: { minHeight: 48, justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
  filterActive: { borderBottomColor: C.tinta },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
