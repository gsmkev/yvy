/**
 * Hoy: lo que el recorredor tiene que saber y hacer, en orden. Avisos primero (si hay), después tareas,
 * después lo que ya anotó. Sin secciones vacías: si no hay nada, lo dice una sola vez.
 * Los datos y cada sección viven en src/today/.
 */
import { useEffect, useRef, type ElementRef } from "react";
import { Alert, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CloudRain } from "lucide-react-native";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { isFieldRoleName } from "../../src/office/team";
import { AlertCard } from "../../src/today/AlertCard";
import { dayLabel, firstName } from "../../src/today/format";
import { OpenTasks, OwnerSummary, TeamTasks, YourDay } from "../../src/today/Sections";
import { st } from "../../src/today/styles";
import { useTodayData } from "../../src/today/useTodayData";
import { FarmLine } from "../../src/ui/FarmLine";
import { ForecastStrip } from "../../src/ui/ForecastStrip";
import { Button, EmptyState, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

export default function Today() {
  const { alertId } = useLocalSearchParams<{ alertId?: string }>();
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const alertY = useRef<Record<string, number>>({});
  const { session, userId, farmId, alerts, plots, votes, todayRecords, plotName, readOnly, summary, worse, todayIso, team, open, done, empty } = useTodayData();
  // Roles de oficina: 2 avisos y "Ver los N" (tienen la pantalla de Avisos); roles de campo: todos, compactos.
  const shownAlerts = !isFieldRoleName(session?.organization.role ?? "") && alerts.length > 2 ? [...alerts].sort((x, y) => Number(y.id === alertId) - Number(x.id === alertId) || Number(y.severity === "warning") - Number(x.severity === "warning")).slice(0, 2) : alerts;

  // Primera vez que se entra a otra organización: decir a cuál.
  useEffect(() => {
    const name = getDb().getKv("org_entered_notice");
    if (!name) return;
    getDb().setKv("org_entered_notice", null);
    Alert.alert(t("app.enteredOrg", { name }));
  }, [session?.organization.id]);

  const scrollToAlert = (id: string) => {
    const y = alertY.current[id];
    if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };
  useEffect(() => {
    if (alertId) scrollToAlert(alertId);
  }, [alertId, alerts.length]);

  const showOwner = !!summary && (summary.byAuthor.length > 0 || worse.length > 0);

  return (
    <ScrollView ref={scroller} style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <FarmLine />
      <Text style={T.small}>{dayLabel()}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{firstName(session?.user.fullName ?? "")}</Text>

      <ForecastStrip farmId={farmId ?? plots[0]?.farmId ?? null} />

      {/* La lluvia es lo que más se anota: un toque, directo a los milímetros (lluvia de la estancia, sin lote).
          El mismo destino lo abre el atajo de Android (yvy://annotate?kind=rain&farmLevel=1). */}
      {!readOnly && (
        <Button
          kind="secondary"
          icon={CloudRain}
          title={t("app.quickRain")}
          onPress={() => router.push({ pathname: "/annotate", params: { kind: "rain", farmLevel: "1" } })}
          style={{ marginTop: 16 }}
        />
      )}

      {/* Primero lo que pide acción: avisos. */}
      {shownAlerts.map((a) => (
        <AlertCard
          key={a.id}
          a={a}
          voted={votes[a.id]}
          picked={a.id === alertId}
          onLayout={(y) => {
            alertY.current[a.id] = y;
            if (a.id === alertId) scrollToAlert(a.id);
          }}
        />
      ))}
      {alerts.length > shownAlerts.length && (
        <Pressable accessibilityRole="button" onPress={() => router.push("/office/alerts")} style={st.seeAll}>
          <Text style={[T.bodyMedium, { color: C.accionOscuro }]}>{t("app.alertsSeeAll", { n: alerts.length })}</Text>
        </Pressable>
      )}

      {empty && <EmptyState title={t("app.nothingToday")} hint={t("app.nothingTodayHint")} />}

      {open.length > 0 && <OpenTasks open={open} readOnly={readOnly} plotName={plotName} />}

      {team.length > 0 && <TeamTasks team={team} todayIso={todayIso} userId={userId} names={summary?.names ?? {}} plotName={plotName} />}

      {showOwner && summary && <OwnerSummary summary={summary} worse={worse} userId={userId} plotName={plotName} />}

      {(todayRecords.length > 0 || done.length > 0) && <YourDay done={done} todayRecords={todayRecords} plotName={plotName} />}
    </ScrollView>
  );
}
