/** Historial: 30 días agrupados por día. El estado de envío va en el borde izquierdo: pendiente punteado trigo, enviado sólido soja. */
import { useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { describeRecord, LIMITS, t, type RecordKind, isoToDisplay } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { memberNames } from "../../src/lib/members";
import { authorName, isOwnerMode } from "../../src/lib/ownerSummary";
import { useSession } from "../../src/lib/session";
import { useLocal } from "../../src/lib/useLocal";
import { activeFilterCount, filterRecords, NO_RECORD_FILTER, type RecordFilter } from "../../src/lib/plotInfo";
import { DateField, FormSheet, SelectField } from "../../src/office/ui";
import { SlidersHorizontal, X } from "lucide-react-native";
import { RECORD_ICON } from "../../src/ui/icons";
import { EmptyState, Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

const dayKey = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const dayTitle = (key: string) => {
  const today = dayKey(Date.now());
  if (key === today) return t("app.common.today");
  if (key === dayKey(Date.now() - 86_400_000)) return t("app.common.yesterday").replace(/^./, (c) => c.toUpperCase());
  const d = new Date(`${key}T12:00:00-03:00`);
  const txt = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function History() {
  const { farmId } = useFarmChoice();
  const session = useSession();
  // F-29: el dueño ve lo de todos, con el nombre de quien anotó.
  const owner = isOwnerMode(session?.organization.role);
  const names = useLocal(() => (owner ? memberNames(getDb()) : {}), [owner]);
  const records = useLocal(() => byFarm(getDb().records(owner ? 500 : 200), farmId), [farmId, owner]);
  // Ola 2 (94): para oficina, filtros por estancia, autor y fechas sobre la lista local.
  const farms = useLocal(() => getDb().farms());
  const [rf, setRf] = useState<RecordFilter>(NO_RECORD_FILTER);
  const [draft, setDraft] = useState<RecordFilter | null>(null);
  const nFilters = owner ? activeFilterCount(rf) : 0;
  const plots = useLocal(() => getDb().plots());
  const thumbs = useLocal(() => getDb().thumbsByRecord(2));
  const [filter, setFilter] = useState<RecordKind | "all">("all");
  // Solo se ofrecen los tipos que hay en el historial.
  const kinds = [...new Set(records.map((r) => r.kind))];
  const active = filter !== "all" && kinds.includes(filter) ? filter : "all";
  const byKind = active === "all" ? records : records.filter((r) => r.kind === active);
  const shown = owner ? filterRecords(byKind, rf) : byKind;
  const authorOf = (id: string) => authorName(id, session?.user.id, names);
  const authors = [...new Set(records.map((r) => r.authorId))];
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
          <Text style={[T.display, { marginBottom: 8 }]}>{t("app.common.history")}</Text>
          {owner && (
            <View style={{ marginBottom: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => setDraft(rf)} style={st.filterBtn}>
                <SlidersHorizontal size={20} color={C.accionOscuro} strokeWidth={2} />
                <Text style={[T.bodyMedium, { color: C.accionOscuro }]}>
                  {nFilters ? t("ui.common.filtersActive", { n: nFilters }) : t("ui.common.filters")}
                </Text>
              </Pressable>
              {nFilters > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {(
                    [
                      rf.farmId ? ["farmId", farms.find((f) => f.id === rf.farmId)?.name ?? ""] : null,
                      rf.authorId ? ["authorId", authorOf(rf.authorId)] : null,
                      rf.from ? ["from", `${t("office.filter.from")} ${isoToDisplay(rf.from)}`] : null,
                      rf.to ? ["to", `${t("office.filter.to")} ${isoToDisplay(rf.to)}`] : null,
                    ] as ([keyof RecordFilter, string] | null)[]
                  )
                    .filter((x): x is [keyof RecordFilter, string] => !!x)
                    .map(([key, label]) => (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityLabel={`${label}: ${t("ui.common.delete")}`}
                        onPress={() => setRf({ ...rf, [key]: "" })}
                        style={st.chip}
                      >
                        <Text style={T.smallMedium}>{label}</Text>
                        <X size={16} color={C.tinta2} strokeWidth={2} />
                      </Pressable>
                    ))}
                  <Pressable accessibilityRole="button" onPress={() => setRf(NO_RECORD_FILTER)} style={st.chip}>
                    <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("office.filter.clear")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
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
                  <Text style={[T.bodyMedium, { color: active === kd ? C.tinta : C.tinta2 }]}>
                    {kd === "all" ? t("app.common.filterAll") : t(`record-kinds.kind.${kd}`)}
                  </Text>
                </Pressable>
              ))}
            </FadingScroll>
          )}
        </View>
      }
      ListEmptyComponent={
        nFilters > 0 || active !== "all" ? (
          <EmptyState
            title={t("office.filter.noMatch")}
            action={t("office.filter.clear")}
            onAction={() => {
              setRf(NO_RECORD_FILTER);
              setFilter("all");
            }}
          />
        ) : (
          <EmptyState
            title={t("app.no.recordsYet")}
            hint={t("app.no.recordsHint")}
            action={t("app.common.annotate")}
            onAction={() => router.push("/annotate")}
          />
        )
      }
      ListFooterComponent={
        <FormSheet
          visible={!!draft}
          title={t("ui.common.filters")}
          onClose={() => setDraft(null)}
          onSubmit={() => {
            if (draft) setRf(draft);
            setDraft(null);
          }}
          submitLabel={t("office.filter.apply")}
        >
          {draft ? (
            <>
              {farms.length > 1 ? (
                <SelectField
                  label={t("ui.common.farm")}
                  value={draft.farmId}
                  options={[
                    { value: "", label: t("ui.common.all") },
                    ...farms.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                  onChange={(v) => setDraft({ ...draft, farmId: v })}
                />
              ) : null}
              {authors.length > 1 ? (
                <SelectField
                  label={t("ui.common.author")}
                  value={draft.authorId}
                  options={[
                    { value: "", label: t("ui.common.all") },
                    ...authors.map((a) => ({ value: a, label: authorOf(a) })),
                  ]}
                  onChange={(v) => setDraft({ ...draft, authorId: v })}
                />
              ) : null}
              <DateField
                label={t("office.filter.from")}
                value={draft.from}
                onChange={(v) => setDraft({ ...draft, from: v })}
              />
              <DateField
                label={t("office.filter.to")}
                value={draft.to}
                onChange={(v) => setDraft({ ...draft, to: v })}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setDraft(NO_RECORD_FILTER)}
                style={{ minHeight: 48, justifyContent: "center", marginTop: 8 }}
              >
                <Text style={[T.bodyMedium, { color: C.accionOscuro }]}>{t("office.filter.clear")}</Text>
              </Pressable>
            </>
          ) : null}
        </FormSheet>
      }
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      renderItem={({ item: r }) => (
        <Row
          icon={RECORD_ICON[r.kind]}
          title={describeRecord(r.kind, JSON.parse(r.data))}
          subtitle={[
            t(`record-kinds.kind.${r.kind}`),
            owner ? authorName(r.authorId, session?.user.id, names) : null,
            plots.find((p) => p.id === r.plotId)?.name,
            hhmm(r.capturedAt),
          ]
            .filter(Boolean)
            .join(" · ")}
          onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
          status={r.rejected ? "rejected" : r.pending ? "pending" : "synced"}
          right={
            r.rejected ? (
              <Text style={[T.small, { color: C.peligro }]}>{t("app.common.rejected")}</Text>
            ) : r.photos > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {thumbs.get(r.id)?.map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    style={st.thumb}
                    accessibilityLabel={t("app.photos.count", { n: r.photos, max: LIMITS.photos.maxPerRecord })}
                  />
                ))}
                {r.photos > (thumbs.get(r.id)?.length ?? 0) && (
                  <Text style={T.small}>
                    {thumbs.get(r.id)?.length ? `+${r.photos - thumbs.get(r.id)!.length}` : r.photos}
                  </Text>
                )}
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
    <View
      pointerEvents="none"
      style={[
        st.fade,
        side === "left" ? { left: 0, flexDirection: "row" } : { right: 0, flexDirection: "row-reverse" },
      ]}
    >
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
  filterBtn: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.lineaFuerte,
    backgroundColor: C.blanco,
  },
  thumb: { width: 48, height: 48, borderRadius: 8 },
});
