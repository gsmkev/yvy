/**
 * Avisos completos: los activos y los de los últimos 30 días, con "¿Te sirvió?". Salen de la base local (la tabla
 * `alerts` ya se sincroniza), así que se ven sin señal.
 */
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { isAlertActive, isoToDmy, localDate, sortAlerts, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { flushAlertVotes, localChanged } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { readVotes, recordVote } from "../../src/lib/votes";
import { AlertCard } from "../../src/ui/AlertCard";
import { FarmLine } from "../../src/ui/FarmLine";
import { EmptyState, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

const PAST_DAYS = 30;

export default function Alerts() {
  const { farmId } = useFarmChoice();
  const now = Date.now();
  const all = useLocal(() => byFarm(getDb().alertsSince(PAST_DAYS * 86_400_000), farmId), [farmId]);
  const farms = useLocal(() => getDb().farms());
  const votes = useLocal(() => readVotes(getDb()));
  const active = sortAlerts(all.filter((a) => isAlertActive(a, now)));
  const past = all.filter((a) => !isAlertActive(a, now)).sort((a, b) => b.validFrom - a.validFrom);
  const farmName = (id: string) => (farms.length > 1 ? farms.find((f) => f.id === id)?.name : undefined);
  const vote = (id: string) => (useful: boolean) => {
    recordVote(getDb(), id, useful);
    localChanged();
    void flushAlertVotes();
  };
  const until = (a: (typeof all)[number]) => (a.validTo ? t("app.alertUntil", { date: isoToDmy(localDate(a.validTo)) }) : undefined);
  const ended = (a: (typeof all)[number]) => t("app.alertEndedOn", { date: isoToDmy(localDate(a.resolvedAt ?? a.validTo ?? a.validFrom)) });

  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad}>
      <Stack.Screen options={{ title: "" }} />
      <FarmLine />
      <Text style={T.display}>{t("ui.alertsTitle")}</Text>
      {all.length === 0 && <EmptyState title={t("app.alertsNone")} hint={t("app.alertsNoneHint")} />}
      {active.length > 0 && <SectionHeader first title={t("app.alertsActive")} />}
      {active.map((a) => (
        <AlertCard key={a.id} alert={a} voted={votes[a.id]} onVote={vote(a.id)} farmName={farmName(a.farmId)} when={until(a)} />
      ))}
      {past.length > 0 && <SectionHeader title={t("app.alertsPast")} />}
      {past.map((a) => (
        <AlertCard key={a.id} alert={a} muted voted={votes[a.id]} onVote={vote(a.id)} farmName={farmName(a.farmId)} when={ended(a)} />
      ))}
    </ScrollView>
  );
}
