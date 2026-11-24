/**
 * Hoy: lo que el recorredor tiene que saber y hacer, en orden. Avisos primero (si hay), después tareas,
 * después lo que ya anotó. Sin secciones vacías: si no hay nada, lo dice una sola vez.
 * Los datos y cada sección viven en src/today/.
 */
import { useEffect, useRef, type ElementRef } from "react";
import { Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CloudRain } from "lucide-react-native";
import { t } from "@yvy/shared";
import { AlertCard } from "../../src/today/AlertCard";
import { alertsToShow, dayLabel, firstName, useOrgEnteredNotice } from "../../src/today/format";
import { TodaySections } from "../../src/today/Sections";
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
  const data = useTodayData();
  const { session, farmId, alerts, plots, votes, readOnly, empty } = data;
  const shownAlerts = alertsToShow(alerts, session?.organization.role ?? "", alertId);

  useOrgEnteredNotice(session?.organization.id);

  const scrollToAlert = (id: string) => {
    const y = alertY.current[id];
    if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };
  useEffect(() => {
    if (alertId) scrollToAlert(alertId);
  }, [alertId, alerts.length]);

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

      <TodaySections data={data} />
    </ScrollView>
  );
}
