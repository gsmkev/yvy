import { FlatList, StyleSheet, Text, View } from "react-native";
import { Camera, ClipboardList, CloudOff, CheckCircle2, XCircle } from "lucide-react-native";
import { describeRecord, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { useLocal } from "../../src/lib/useLocal";
import { RECORD_ICON } from "../../src/ui/icons";
import { EmptyState, Header, Muted, SyncCard, styles as k } from "../../src/ui/kit";
import { C, MONO } from "../../src/ui/theme";

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
      ListHeaderComponent={<Header eyebrow="30 días" title={t("app.history")} />}
      ListEmptyComponent={
        <EmptyState icon={ClipboardList} title={t("app.noRecordsYet")} text={t("app.noRecordsHint")} />
      }
      renderItem={({ item: r }) => {
        const Icon = RECORD_ICON[r.kind];
        return (
          <SyncCard pending={r.pending}>
            <View style={s.row}>
              <Icon size={20} color={C.accion} />
              <Text style={s.kind}>{t(`recordKinds.${r.kind}`)}</Text>
              <View style={s.state}>
                {r.rejected ? (
                  <XCircle size={16} color={C.peligro} />
                ) : r.pending ? (
                  <CloudOff size={16} color={C.trigoTexto} />
                ) : (
                  <CheckCircle2 size={16} color={C.accion} />
                )}
                <Text style={[s.stateText, { color: r.rejected ? C.peligro : r.pending ? C.trigoTexto : C.accion }]}>
                  {r.rejected ? t("app.rejected") : r.pending ? t("app.pending") : t("app.synced")}
                </Text>
              </View>
            </View>
            <Text style={s.text}>{describeRecord(r.kind, JSON.parse(r.data))}</Text>
            <View style={s.meta}>
              <Muted>
                {new Date(r.capturedAt).toLocaleString("es-PY", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
                {r.plotId ? ` · ${plots.find((p) => p.id === r.plotId)?.name ?? ""}` : ""}
              </Muted>
              {r.photos > 0 && (
                <View style={s.photos}>
                  <Camera size={14} color={C.tinta2} />
                  <Muted>{r.photos}</Muted>
                </View>
              )}
            </View>
            {r.rejected && (
              <Text style={{ color: C.peligro, marginTop: 4 }}>
                {t(`rejectReasons.${r.rejected}` as never, { max: 3 })}
              </Text>
            )}
          </SyncCard>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  kind: { fontSize: 17, fontWeight: "700", color: C.surco, flex: 1 },
  state: { flexDirection: "row", alignItems: "center", gap: 4 },
  stateText: { ...MONO, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  text: { fontSize: 16, color: C.surco, marginVertical: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  photos: { flexDirection: "row", alignItems: "center", gap: 4 },
});
