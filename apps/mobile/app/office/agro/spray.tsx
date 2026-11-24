/** Horas para pulverizar (A-13): línea de horas aptas por día y ventanas. GET /org/farms/:id/spray-windows (la misma que guarda src/lib/sprayHours.ts). Datos de MET Norway. */
import { useEffect } from "react";
import { View } from "react-native";
import { t, ATTRIBUTION } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { refreshSprayHours } from "../../../src/lib/sprayHours";
import { useFarmPick } from "../../../src/office/farmPick";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

interface Spray {
  hours: { at: number; tempC: number | null; windKmh: number | null; humidityPct: number | null; precipMm: number | null; deltaT: number | null; ok: boolean }[];
  windows: { from: number; to: number }[];
  limits: { windMinKmh: number; windMaxKmh: number; deltaTMin: number; deltaTMax: number };
}

const TZ = "America/Asuncion";
const dayKey = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const hh = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(11, 13);
const dayLabel = (ms: number, today: string) => {
  const k = dayKey(ms);
  if (k === today) return t("office.spray.dayToday");
  return new Date(ms).toLocaleDateString("es-PY", { weekday: "short", day: "numeric", timeZone: TZ }).replace(".", "");
};

export default function SprayHours() {
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<Spray>(farm ? `/org/farms/${farm.id}/spray-windows` : null);
  // Deja guardadas las horas para precargar viento y temperatura al anotar una aplicación sin señal.
  useEffect(() => {
    if (farm && q.data && q.data.hours.length) void refreshSprayHours(getDb(), farm.id, async () => ({ hours: q.data!.hours }), Date.now());
  }, [q.data, farm?.id]);
  const today = dayKey(Date.now());
  return (
    <FarmFrame title={t("ui.spray.title")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.hours.length === 0} empty={{ title: t("ui.spray.noData") }}>
        {(d) => {
          const days = new Map<string, Spray["hours"]>();
          for (const h of d.hours) days.set(dayKey(h.at), [...(days.get(dayKey(h.at)) ?? []), h]);
          return (
            <View>
              <Text style={[T.small, { marginTop: 8 }]}>{t("ui.spray.criteria", { wmin: d.limits.windMinKmh, wmax: d.limits.windMaxKmh, dmin: d.limits.deltaTMin, dmax: d.limits.deltaTMax })}</Text>
              <SectionHeader title={t("office.spray.hoursNow")} />
              {[...days.entries()].map(([key, hours]) => (
                <View key={key} accessible accessibilityLabel={`${dayLabel(hours[0]!.at, today)}: ${hours.filter((h) => h.ok).length} / ${hours.length}`} style={{ marginBottom: 14 }}>
                  <Text style={[T.smallMedium, { textTransform: "capitalize" }]}>{dayLabel(hours[0]!.at, today)}</Text>
                  <View style={{ flexDirection: "row", gap: 1, height: 28, marginTop: 4 }}>
                    {hours.map((h) => (
                      <View key={h.at} style={{ flex: 1, backgroundColor: h.ok ? C.soja : C.linea, borderRadius: 2 }} />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                    <Text style={[T.small, { fontSize: 13 }]}>{`${hh(hours[0]!.at)} h`}</Text>
                    <Text style={[T.small, { fontSize: 13 }]}>{`${hh(hours[hours.length - 1]!.at)} h`}</Text>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Text style={T.small}><Text style={{ color: C.soja }}>■</Text>{` ${t("ui.spray.legendOk")}`}</Text>
                <Text style={T.small}><Text style={{ color: C.lineaFuerte }}>■</Text>{` ${t("ui.spray.legendNo")}`}</Text>
              </View>
              <SectionHeader title={t("office.spray.windowsTitle")} />
              <DataList
                rows={d.windows}
                keyOf={(w) => String(w.from)}
                title={(w) => t("ui.spray.windowLine", { day: dayLabel(w.from, today), from: `${hh(w.from)}:00`, to: `${hh(w.to)}:00` })}
                empty={{ title: t("ui.spray.none") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>{t(ATTRIBUTION.metNorway)}</Text>
            </View>
          );
        }}
      </OnlineState>
    </FarmFrame>
  );
}
