/**
 * Monitoreo por estaciones (F-12): el usuario camina el lote y en cada estación cuenta cada plaga de la plantilla
 * del cultivo. La app muestra el promedio corriente contra el umbral por defecto. Estado controlado por la
 * pantalla de anotar para no perder las estaciones al volver atrás.
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import {
  compareThresholds,
  LIMITS,
  MONITOR_TEMPLATES,
  stationAverages,
  t,
  type MessageKey,
  type MonitorCrop,
  type MonitorItem,
  type Station,
} from "@yvy/shared";
import { accuracyLabel, currentFix, type Fix } from "../lib/location";
import { Button, s as k, Text } from "./kit";
import { C, GUTTER, RADIUS, T, TOUCH } from "./theme";
import { gpsHintText, useGpsStage } from "../lib/gpsHint";

const tr = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

export const itemLabel = (i: MonitorItem) => tr(`app.monitor_${i.key}`);
export const unitLabel = (i: MonitorItem) => tr(`app.monitorUnit_${i.unit}`);

/** Promedios contra umbral; se reutiliza en la estación y en el resumen. */
function Averages({ items, stations, title }: { items: readonly MonitorItem[]; stations: Station[]; title: string }) {
  if (!stations.length) return null;
  const cmp = compareThresholds(stationAverages(stations, items), items);
  return (
    <View style={st.avgBox}>
      <Text style={T.smallMedium}>{title}</Text>
      {items.map((i) => {
        const c = cmp.find((x) => x.key === i.key);
        if (!c) return null;
        return (
          <View key={i.key} style={st.avgRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={T.bodyMedium}>{itemLabel(i)}</Text>
              <Text style={T.small}>{t("app.stationsLine", { avg: fmt(c.average), unit: unitLabel(i), thr: fmt(c.threshold) })}</Text>
            </View>
            <Text style={[T.bodyMedium, { color: c.over ? C.peligro : C.accionOscuro }]}>
              {c.over ? t("app.stationOver") : t("app.stationUnder")}
            </Text>
          </View>
        );
      })}
      <Text style={[T.small, { marginTop: 8 }]}>{t("app.stationsDefaults")}</Text>
    </View>
  );
}

function Counter({ item, value, onChange }: { item: MonitorItem; value: number; onChange: (v: number) => void }) {
  const max = LIMITS.monitoring.maxCount;
  return (
    <View style={st.counter}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={T.bodyMedium}>{itemLabel(item)}</Text>
        <Text style={T.small}>{unitLabel(item)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.stationMinus", { pest: itemLabel(item) })}
        onPress={() => onChange(Math.max(0, value - item.step))}
        style={st.stepBtn}
        hitSlop={4}
      >
        <Minus size={24} color={C.tinta} />
      </Pressable>
      <Text style={st.value} accessibilityLabel={`${itemLabel(item)}: ${value}`}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.stationPlus", { pest: itemLabel(item) })}
        onPress={() => onChange(Math.min(max, value + item.step))}
        style={[st.stepBtn, { backgroundColor: C.accionSuave, borderColor: C.accion }]}
        hitSlop={4}
      >
        <Plus size={24} color={C.accionOscuro} />
      </Pressable>
    </View>
  );
}

export function Stations({
  crop,
  stations,
  onChange,
  onDone,
}: {
  crop: MonitorCrop;
  stations: Station[];
  onChange: (s: Station[]) => void;
  onDone: () => void;
}) {
  const items = MONITOR_TEMPLATES[crop] as readonly MonitorItem[];
  const target = LIMITS.monitoring.defaultStations;
  const [summary, setSummary] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [fix, setFix] = useState<Fix | null | "searching">("searching");
  const n = stations.length + 1;
  const gpsHint = gpsHintText(useGpsStage(fix === "searching", n));

  // Una ubicación nueva por estación.
  useEffect(() => {
    if (summary) return;
    let live = true;
    setFix("searching");
    setCounts({});
    currentFix().then((f) => live && setFix(f));
    return () => {
      live = false;
    };
  }, [n, summary]);

  if (summary) {
    return (
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={T.title}>{t("app.stationsDoneTitle")}</Text>
        <Text style={[T.small, { marginTop: 6 }]}>{t(stations.length === 1 ? "app.stationsValueOne" : "app.stationsValue", { n: stations.length })}</Text>
        <Averages items={items} stations={stations} title={t("app.stationsAverageOf", { n: stations.length })} />
        <View style={{ height: 20 }} />
        <Button big title={t("app.stationsContinue")} onPress={onDone} />
        {stations.length < LIMITS.monitoring.maxStations && (
          <Button kind="secondary" title={t("app.stationsAddAnother")} onPress={() => setSummary(false)} style={{ marginTop: 12 }} />
        )}
      </ScrollView>
    );
  }

  const save = () => {
    const f = fix === "searching" ? null : fix;
    const station: Station = {
      ...(f ? { lon: f.lon, lat: f.lat } : {}),
      ...(f?.accuracy ? { accuracyM: Math.round(f.accuracy) } : {}),
      counts: Object.fromEntries(items.map((i) => [i.key, counts[i.key] ?? 0])),
    };
    const next = [...stations, station];
    onChange(next);
    // Al llegar a la cantidad propuesta pasa al resumen; antes de eso sigue con la próxima estación.
    if (next.length >= target) setSummary(true);
  };

  const live = [...stations, { counts }];
  const gps = fix === "searching" ? [t("app.stationGpsSearching"), gpsHint].filter(Boolean).join(" ") : fix ? accuracyLabel(fix.accuracy) : `${t("app.stationGpsNone")}. ${t("app.gpsNoneHint")}`;
  return (
    <ScrollView contentContainerStyle={[k.pad, { paddingBottom: 40 }]}>
      <Text style={T.title}>
        {n <= target ? t("app.stationTitle", { n, total: target }) : t("app.stationTitleExtra", { n })}
      </Text>
      <Text style={[T.small, { marginTop: 6 }]}>{t("app.stationHint")}</Text>
      <Text style={[T.small, { marginTop: 2, marginBottom: 12 }]}>{gps}</Text>
      {items.map((i) => (
        <Counter key={i.key} item={i} value={counts[i.key] ?? 0} onChange={(v) => setCounts((c) => ({ ...c, [i.key]: v }))} />
      ))}
      <Averages items={items} stations={live} title={t("app.stationsAverageTitle")} />
      <View style={{ height: 20 }} />
      <Button big title={t("app.stationSave")} onPress={save} />
      {stations.length > 0 && (
        <Button
          kind="text"
          title={t(stations.length === 1 ? "app.stationsFinishOne" : "app.stationsFinish", { n: stations.length })}
          onPress={() => setSummary(true)}
          style={{ marginTop: 8 }}
        />
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  counter: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: TOUCH + 8, borderBottomWidth: 1, borderBottomColor: C.linea, paddingVertical: 8 },
  stepBtn: { width: TOUCH, height: TOUCH, borderRadius: RADIUS, borderWidth: 1.5, borderColor: C.lineaFuerte, backgroundColor: C.blanco, alignItems: "center", justifyContent: "center" },
  value: { ...T.heading, minWidth: 44, textAlign: "center" },
  avgBox: { marginTop: 20, padding: GUTTER - 4, borderRadius: RADIUS, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, gap: 10 },
  avgRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
