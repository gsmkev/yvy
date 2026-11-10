/** Historial: 30 días agrupados por día. Lo pendiente de mandar se distingue por el color del punto. */
import { SectionList, StyleSheet, Text, View } from "react-native";
import { Camera } from "lucide-react-native";
import { describeRecord, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { useLocal } from "../../src/lib/useLocal";
import { Row, s as k } from "../../src/ui/kit";
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
  const records = useLocal(() => getDb().records());
  const plots = useLocal(() => getDb().plots());
  const sections = Object.entries(
    records.reduce<Record<string, typeof records>>((acc, r) => {
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
      ListHeaderComponent={<Text style={[T.display, { marginBottom: 8 }]}>{t("app.history")}</Text>}
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
          left={<View style={[st.dot, { backgroundColor: r.rejected ? C.peligro : r.pending ? C.trigo : C.accion }]} />}
          right={
            r.rejected ? (
              <Text style={[T.small, { color: C.peligro }]}>{t("app.rejected")}</Text>
            ) : r.photos > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Camera size={16} color={C.tinta3} />
                <Text style={T.small}>{r.photos}</Text>
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
  dot: { width: 12, height: 12, borderRadius: 6 },
});
