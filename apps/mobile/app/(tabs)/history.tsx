/** Historial: 30 días agrupados por día. El estado de envío va en el borde izquierdo: pendiente punteado trigo, enviado sólido soja. */
import { useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { describeRecord, LIMITS, t, type RecordKind } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { memberNames } from "../../src/lib/members";
import { authorName, isOwnerMode } from "../../src/lib/ownerSummary";
import { useSession } from "../../src/lib/session";
import { useLocal } from "../../src/lib/useLocal";
import { EmptyState, Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

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
  const session = useSession();
  // F-29: el dueño ve lo de todos, con el nombre de quien anotó.
  const owner = isOwnerMode(session?.organization.role);
  const names = useLocal(() => (owner ? memberNames(getDb()) : {}), [owner]);
  const records = useLocal(() => byFarm(getDb().records(), farmId), [farmId]);
  const plots = useLocal(() => getDb().plots());
  const thumbs = useLocal(() => getDb().thumbsByRecord(2));
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
            <FadingScroll>
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
            </FadingScroll>
          )}
        </View>
      }
      ListEmptyComponent={
        <EmptyState title={t("app.noRecordsYet")} hint={t("app.noRecordsHint")} action={t("app.annotate")} onAction={() => router.push("/annotate")} />
      }
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      renderItem={({ item: r }) => (
        <Row
          title={describeRecord(r.kind, JSON.parse(r.data))}
          subtitle={[t(`recordKinds.${r.kind}`), owner ? authorName(r.authorId, session?.user.id, names) : null, plots.find((p) => p.id === r.plotId)?.name, hhmm(r.capturedAt)].filter(Boolean).join(" · ")}
          onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
          status={r.rejected ? "rejected" : r.pending ? "pending" : "synced"}
          right={
            r.rejected ? (
              <Text style={[T.small, { color: C.peligro }]}>{t("app.rejected")}</Text>
            ) : r.photos > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {thumbs.get(r.id)?.map((uri) => (
                  <Image key={uri} source={{ uri }} style={st.thumb} accessibilityLabel={t("app.photosCount", { n: r.photos, max: LIMITS.photos.maxPerRecord })} />
                ))}
                {r.photos > (thumbs.get(r.id)?.length ?? 0) && <Text style={T.small}>{thumbs.get(r.id)?.length ? `+${r.photos - thumbs.get(r.id)!.length}` : r.photos}</Text>}
              </View>
            ) : undefined
          }
        />
      )}
    />
  );
}

/** Fila que se desplaza hacia los costados; el borde que tiene más contenido se desvanece para que se note que sigue. */
function FadingScroll({ children }: { children: ReactNode }) {
  const [m, setM] = useState({ x: 0, w: 0, c: 0 });
  const left = m.x > 4;
  const right = m.c > m.w && m.x + m.w < m.c - 4;
  return (
    <View style={st.filtersWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.filters}
        contentContainerStyle={{ gap: 22, paddingRight: 56 }}
        scrollEventThrottle={32}
        onScroll={(e) => setM((v) => ({ ...v, x: e.nativeEvent.contentOffset.x }))}
        onLayout={(e) => setM((v) => ({ ...v, w: e.nativeEvent.layout.width }))}
        onContentSizeChange={(w) => setM((v) => ({ ...v, c: w }))}
      >
        {children}
      </ScrollView>
      {left && <Fade side="left" />}
      {right && <Fade side="right" />}
    </View>
  );
}

function Fade({ side }: { side: "left" | "right" }) {
  return (
    <View pointerEvents="none" style={[st.fade, side === "left" ? { left: 0, flexDirection: "row" } : { right: 0, flexDirection: "row-reverse" }]}>
      {Array.from({ length: 14 }, (_, i) => (
        <View key={i} style={{ width: 4, backgroundColor: C.papel, opacity: Math.pow(1 - i / 14, 0.6) }} />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  filtersWrap: { marginHorizontal: -20 },
  fade: { position: "absolute", top: 0, bottom: 0 },
  filters: { paddingHorizontal: 20, flexGrow: 0 },
  filter: { minHeight: 48, justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
  filterActive: { borderBottomColor: C.tinta },
  thumb: { width: 48, height: 48, borderRadius: 8 },
});
