import { FlatList, StyleSheet, Text, View } from "react-native";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { KIND_ICON } from "../../src/lib/forms";
import { useLocal } from "../../src/lib/useLocal";
import { H1, Muted, SyncCard, styles as k } from "../../src/ui/kit";
import { C } from "../../src/ui/theme";

const summary = (data: string) =>
  Object.entries(JSON.parse(data) as Record<string, unknown>)
    .filter(([key, v]) => key !== "readAt" && v !== "" && v !== undefined)
    .map(([key, v]) =>
      key === "mm" ? `${v} mm` : typeof v === "boolean" ? (v ? t("app.yes") : t("app.no")) : String(v),
    )
    .join(" · ");

/** Últimos 30 días (RF-40), con la firma visual punteado → sólido (RF-33). */
export default function History() {
  const records = useLocal(() => getDb().records());
  const plots = useLocal(() => getDb().plots());
  return (
    <FlatList
      style={k.screen}
      contentContainerStyle={k.pad}
      data={records}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={<H1>{t("app.history")}</H1>}
      renderItem={({ item: r }) => (
        <SyncCard pending={r.pending}>
          <View style={s.row}>
            <Text style={s.kind}>
              {KIND_ICON[r.kind]} {t(`recordKinds.${r.kind}`)}
            </Text>
            <Text style={[s.badge, { color: r.rejected ? C.alerta : r.pending ? C.trigo : C.soja }]}>
              {r.rejected ? "✕" : r.pending ? t("app.pending") : "✔"}
            </Text>
          </View>
          <Text style={s.text}>{summary(r.data)}</Text>
          <Muted>
            {new Date(r.capturedAt).toLocaleString("es-PY", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {r.plotId ? ` · ${plots.find((p) => p.id === r.plotId)?.name ?? ""}` : ""}
            {r.photos ? ` · 📷 ${r.photos}` : ""}
          </Muted>
          {r.rejected && (
            <Text style={{ color: C.alerta }}>
              {t("app.rejected")}: {t(`rejectReasons.${r.rejected}` as never, { max: 3 })}
            </Text>
          )}
        </SyncCard>
      )}
    />
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
  kind: { fontSize: 17, fontWeight: "700", color: C.surco },
  badge: { fontWeight: "700" },
  text: { fontSize: 16, color: C.surco, marginVertical: 4 },
});
