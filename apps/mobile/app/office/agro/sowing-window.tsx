/** Ventana de siembra (función 77): humedad del suelo y pronóstico para un cultivo. GET /org/farms/:id/sowing-window?crop=. */
import { useState } from "react";
import { View } from "react-native";
import { CROPS, t, type MessageKey, ATTRIBUTION } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, FilterChips } from "../../../src/office/ui";
import { Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

interface Resp {
  crop: string;
  soil: number | null;
  soilDate: string | null;
  forecastRunAt: number | null;
  days: { date: string; ok: boolean; reasons: string[]; rainAhead: boolean }[];
  best: { from: string; to: string } | null;
}
const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

export default function SowingWindow() {
  const { farms, farm, setFarmId } = useFarmPick();
  const [crop, setCrop] = useState<string>("soja");
  const q = useOnline<Resp>(farm ? `/org/farms/${farm.id}/sowing-window?crop=${crop}` : null);
  return (
    <FarmFrame title={t("ui.sow.winTitle")} subtitle={t("ui.sow.winIntro")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <FilterChips value={crop} onChange={setCrop} options={CROPS.filter((c) => c !== "otro").map((c) => ({ value: c as string, label: t(`fields.crop.${c}` as MessageKey) }))} />
      <OnlineState query={q} isEmpty={(d) => d.days.length === 0} empty={{ title: t("office.sow.winNoDays"), hint: t("ui.sow.winNoForecast") }}>
        {(d) => (
          <View>
            <Text style={[T.heading, { marginTop: 20 }]}>
              {d.best ? t(d.best.from === d.best.to ? "ui.sow.winBestOne" : "ui.sow.winBest", { from: dmy(d.best.from), to: dmy(d.best.to) }) : t("ui.sow.winNone")}
            </Text>
            <Text style={[T.small, { marginTop: 4 }]}>
              {d.soil === null
                ? t("ui.sow.winNoSoil")
                : t("ui.sow.winSoil", {
                    pct: `${fmtNumber(d.soil * 100, 0)} %`,
                    date: d.soilDate ? dmy(d.soilDate) : "—",
                  })}
              {d.forecastRunAt ? " · " + t("ui.sow.winForecast", { date: fmtDate(d.forecastRunAt) }) : ""}
            </Text>
            <DataList
              rows={d.days}
              keyOf={(r) => r.date}
              title={(r) => dmy(r.date)}
              subtitle={(r) => (r.ok ? (r.rainAhead ? t("ui.sow.winRainAhead") : undefined) : r.reasons.map((x) => t(`ui.sow.winReason_${x}` as MessageKey)).join(", "))}
              right={(r) => <Text style={[T.bodyMedium, { textAlign: "right", color: r.ok ? C.accionOscuro : C.tinta2 }]}>{r.ok ? t("ui.sow.winOk") : t("ui.sow.winWait")}</Text>}
              empty={{ title: t("office.sow.winNoDays") }}
            />
            <Text style={[T.small, { marginTop: 16 }]}>
              {t("ui.sow.winNote")} {t(ATTRIBUTION.nasaPower)} · {t(ATTRIBUTION.metNorway)}
            </Text>
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
