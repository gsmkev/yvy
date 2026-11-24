/** Estrés calórico del ganado, ITH (función 75): lectura de las próximas 48 horas. GET /org/farms/:id/heat-stress. Datos de MET Norway. */
import { View } from "react-native";
import { CHART, t, type FarmHeatStressResponse, type MessageKey, cToTemp, tempLabel } from "@yvy/shared";
import { useUnits } from "../../../src/lib/units";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDateTime, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { KeyValue, LineChart, StatRow } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}h`;
};

export default function Heat() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<FarmHeatStressResponse>(farm ? `/org/farms/${farm.id}/heat-stress` : null);
  return (
    <FarmFrame title={t("ui.heatTitle")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.hours.length === 0} empty={{ title: t("ui.heatNoData") }}>
        {(d) => {
          const level = d.summary.maxLevel;
          const hot = level === "danger" || level === "emergency";
          const maxTemp = Math.max(...d.hours.map((h) => h.tempC));
          return (
            <View>
              <StatRow
                items={[
                  { label: t("office.heatNow"), value: fmtNumber(d.hours[0]!.thi, 0), unit: "THI" },
                  { label: t("office.heatMax"), value: fmtNumber(d.summary.maxThi ?? 0, 0), unit: t(`ui.heatLevel_${level}` as MessageKey), tone: hot ? "danger" : undefined },
                  { label: t("office.heatTempMax"), value: fmtNumber(cToTemp(maxTemp, units.temp), 0), unit: tempLabel(units.temp) },
                ]}
              />
              <Text accessibilityRole={hot ? "alert" : undefined} style={[hot ? T.bodyMedium : T.small, { marginTop: 12, color: hot ? C.peligro : C.tinta2 }]}>
                {d.summary.dangerHours > 0
                  ? `${t("ui.heatDangerHours", { n: d.summary.dangerHours })}${d.summary.firstDangerAt ? ` · ${t("ui.heatFirstDanger", { date: fmtDateTime(d.summary.firstDangerAt) })}` : ""}`
                  : level === "alert"
                    ? t("ui.heatMax", { v: Math.round(d.summary.maxThi ?? 0), level: t(`ui.heatLevel_${level}` as MessageKey) })
                    : t("ui.heatCalm")}
              </Text>
              <SectionHeader title={t("office.heatByHour")} />
              <LineChart series={[{ label: "THI", color: CHART.warm, points: d.hours.map((h) => ({ x: stamp(h.at), y: Math.round(h.thi) })) }]} />
              <KeyValue rows={(["alert", "danger", "emergency"] as const).map((k) => ({ label: t(`ui.heatLevel_${k}` as MessageKey), value: `≥ ${d.thresholds[k]}` }))} />
              <Text style={[T.small, { marginTop: 16 }]}>{t("ui.heatHint")}</Text>
              <Text style={[T.small, { marginTop: 4 }]}>{t("attribution.metNorway")}</Text>
            </View>
          );
        }}
      </OnlineState>
    </FarmFrame>
  );
}
