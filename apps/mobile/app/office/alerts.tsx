/**
 * Avisos (función 109): todos los avisos activos de todas las estancias, desde la base local (ya sincroniza `alerts`,
 * así que anda sin señal). Plantilla de pantalla LOCAL: useLocal + OfficeScreen + FilterChips + acciones por fila.
 */
import { useState } from "react";
import { Linking, Share, View } from "react-native";
import { Share2 } from "lucide-react-native";
import { alertShareText, t, whatsappUrl, type MessageKey } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { tap } from "../../src/lib/haptics";
import { API_URL } from "../../src/lib/session";
import { flushAlertVotes } from "../../src/lib/sync";
import { showToast } from "../../src/lib/toast";
import { useLocal } from "../../src/lib/useLocal";
import { readVotes, recordVote } from "../../src/lib/votes";
import { fmtDate } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { FilterChips } from "../../src/office/ui";
import { Button, EmptyState, Text } from "../../src/ui/kit";
import { C, F, RADIUS, T } from "../../src/ui/theme";

const RANK: Record<string, number> = { warning: 0, watch: 1, info: 2 };
const EDGE: Record<string, string> = { warning: C.peligro, watch: C.trigo, info: C.soja };

export default function Alerts() {
  const data = useLocal(() => {
    const db = getDb();
    const farms = new Map(db.farms().map((f) => [f.id, f.name]));
    const alerts = db
      .activeAlerts()
      .slice()
      .sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3) || b.validFrom - a.validFrom);
    return { alerts, farms };
  });
  const [farmId, setFarmId] = useState("all");
  const [votes, setVotes] = useState(() => readVotes(getDb()));

  const farmsWithAlerts = [...new Set(data.alerts.map((a) => a.farmId))];
  const shown = farmId === "all" ? data.alerts : data.alerts.filter((a) => a.farmId === farmId);
  const validity = (a: (typeof shown)[number]) => `${fmtDate(a.validFrom)}${a.validTo && a.validTo - a.validFrom > 86_400_000 ? ` – ${fmtDate(a.validTo)}` : ""}`;

  const share = (a: (typeof shown)[number]) => {
    const text = alertShareText({
      kindLabel: t(`ui.alertKind_${a.kind}` as MessageKey),
      severityLabel: t(`ui.severity_${a.severity}` as MessageKey),
      summary: a.summary,
      farmName: data.farms.get(a.farmId),
      validity: validity(a),
      link: `${API_URL}/avisos`,
    });
    Linking.openURL(whatsappUrl(text)).catch(() => Share.share({ message: text }).catch(() => undefined));
  };

  const vote = (id: string, useful: boolean) => {
    tap();
    recordVote(getDb(), id, useful);
    setVotes(readVotes(getDb()));
    showToast(t("office.alertsThanks"));
    void flushAlertVotes();
  };

  return (
    <OfficeScreen title={t("ui.alertsTitle")}>
      {farmsWithAlerts.length > 1 && (
        <FilterChips
          value={farmId}
          onChange={setFarmId}
          options={[
            { value: "all", label: t("office.alertsAllFarms"), count: data.alerts.length },
            ...farmsWithAlerts.map((id) => ({ value: id, label: data.farms.get(id) ?? "—", count: data.alerts.filter((a) => a.farmId === id).length })),
          ]}
        />
      )}
      {shown.length === 0 && <EmptyState title={t("office.alertsEmpty")} hint={t("office.alertsEmptyHint")} />}
      {shown.map((a) => (
        <View key={a.id} style={{ marginTop: 16, padding: 16, borderRadius: RADIUS, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, borderLeftWidth: 4, borderLeftColor: EDGE[a.severity] ?? C.soja }}>
          <Text style={[T.heading, a.severity === "warning" && { color: C.peligro }]}>
            {t(`ui.alertKind_${a.kind}` as MessageKey)}
            {a.probability ? ` · ${t(`ui.probability_${a.probability}` as MessageKey).toLowerCase()}` : ""}
          </Text>
          <Text style={[T.small, { marginTop: 2 }]}>{[data.farms.get(a.farmId), validity(a)].filter(Boolean).join(" · ")}</Text>
          <Text style={[T.body, { marginTop: 8 }]}>{a.summary}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("ui.orientative", { source: a.source })}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Text style={[T.small, { marginRight: 4 }]}>{t("ui.useful")}</Text>
            {([true, false] as const).map((useful) => {
              const on = votes[a.id] === useful;
              return (
                <Button
                  key={String(useful)}
                  kind={on ? "primary" : "secondary"}
                  title={useful ? t("ui.yes") : t("ui.no")}
                  onPress={() => vote(a.id, useful)}
                  style={{ minWidth: 88 }}
                />
              );
            })}
          </View>
          <Button kind="secondary" icon={Share2} title={t("ui.shareWhatsapp")} onPress={() => share(a)} style={{ marginTop: 12 }} />
        </View>
      ))}
      <Text style={{ fontFamily: F.sans, fontSize: 15, color: C.tinta3, marginTop: 24 }}>{t("attribution.metNorway")}</Text>
    </OfficeScreen>
  );
}
