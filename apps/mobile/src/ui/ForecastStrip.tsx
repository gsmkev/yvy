import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { t } from "@yvy/shared";
import { getDb } from "../lib/db";
import { refreshSprayHours } from "../lib/sprayHours";
import { daysOld, readForecast, refreshForecast, upcoming, type CachedForecast } from "../lib/forecast";
import { api } from "../lib/session";
import { useSyncStatus } from "../lib/sync";
import { Text } from "./kit";
import { C, F, RADIUS, T } from "./theme";

const pad = (n: number) => String(n).padStart(2, "0");
const localToday = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const weekday = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-PY", { weekday: "short" }).replace(".", "");
};
const temp = (v: number | null) => (v === null ? "–" : `${Math.round(v)}°`);

/** Franja de pronóstico de 10 días en Hoy: mínima, máxima y lluvia por día; se lee sin señal. */
export function ForecastStrip({ farmId }: { farmId: string | null }) {
  const sync = useSyncStatus();
  const [data, setData] = useState<CachedForecast | null>(() => (farmId ? readForecast(getDb(), farmId) : null));

  useEffect(() => {
    if (!farmId) {
      setData(null);
      return;
    }
    setData(readForecast(getDb(), farmId));
    let alive = true;
    refreshForecast(
      getDb(),
      farmId,
      (id) => api("GET", `/org/farms/${id}/forecast`),
      Date.now(),
    ).then((f) => alive && setData(f));
    // A-12: las horas de hoy quedan guardadas para precargar las condiciones al aplicar
    refreshSprayHours(getDb(), farmId, (id) => api("GET", `/org/farms/${id}/spray-windows`), Date.now());
    return () => {
      alive = false;
    };
    // vuelve a intentar después de cada sincronización exitosa (señal recuperada)
  }, [farmId, sync.lastSyncAt]);

  if (!farmId) return null;
  const now = Date.now();
  const days = data ? upcoming(data, localToday()) : [];
  const downloaded = data ? new Date(data.fetchedAt) : null;
  const sameDay = downloaded ? localToday(downloaded) === localToday() : false;
  const time = downloaded?.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "";
  const old = data ? daysOld(data.fetchedAt, now) : 0;

  return (
    <View style={st.wrap} accessibilityLabel={t("app.forecastTitle")}>
      <Text style={st.title}>{t("app.forecastTitle")}</Text>
      {days.length === 0 ? (
        <Text style={T.small}>{t("app.forecastNone")}</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
            {days.map((d) => (
              <View key={d.date} style={st.day} accessible accessibilityLabel={`${weekday(d.date)} ${d.date.slice(8)}: mínima ${temp(d.tminC)}, máxima ${temp(d.tmaxC)}, lluvia ${Math.round(d.precipMm ?? 0)} milímetros`}>
                <Text style={T.smallMedium}>{weekday(d.date)}</Text>
                <Text style={st.max}>{temp(d.tmaxC)}</Text>
                <Text style={T.small}>{temp(d.tminC)}</Text>
                <Text style={[T.small, (d.precipMm ?? 0) >= 1 && { color: C.tinta, fontFamily: F.sansSemi }]}>{t("app.forecastRain", { mm: Math.round(d.precipMm ?? 0) })}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={[T.small, { marginTop: 6 }]}>
            {sameDay ? t("app.forecastDownloaded", { time }) : t("app.forecastDownloadedOn", { date: downloaded!.toLocaleDateString("es-PY", { day: "numeric", month: "short" }), time })}
            {old >= 1 ? ` · ${t("app.forecastOld", { n: old })}` : ""}
          </Text>
          <Text style={T.small}>{t("app.forecastSource")}</Text>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginBottom: 16 },
  title: { fontFamily: F.sansSemi, fontSize: 15, color: C.tinta2, marginBottom: 6 },
  row: { gap: 8 },
  day: { width: 64, alignItems: "center", paddingVertical: 10, borderRadius: RADIUS, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco },
  max: { fontFamily: F.serif, fontSize: 22, lineHeight: 28, color: C.tinta },
});
