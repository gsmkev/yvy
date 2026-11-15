/** Pesadas y ganancia diaria (función 72): por lote de animales y por animal, con la curva de peso al tocar una fila. GET /org/farms/:id/weighings. */
import { useState } from "react";
import { View } from "react-native";
import { CHART, t, type WeighingsResponse, type WeightSeries } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, KeyValue, LineChart } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

const adg = (v: number | null) => (v === null ? "—" : `${fmtNumber(v, 2)} kg`);

export default function Weighings() {
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<WeighingsResponse>(farm ? `/org/farms/${farm.id}/weighings` : null);
  const [picked, setPicked] = useState<WeightSeries | null>(null);
  const list = (rows: WeightSeries[], title: string) =>
    rows.length === 0 ? null : (
      <>
        <SectionHeader title={title} />
        <DataList
          rows={rows}
          keyOf={(r) => r.key}
          title={(r) => r.label ?? t("ui.weighNoGroup")}
          subtitle={(r) => (r.firstKg === null || r.lastKg === null ? undefined : t("office.weighSeriesLine", { n: r.points.length, first: fmtNumber(r.firstKg), last: fmtNumber(r.lastKg) }))}
          right={(r) => <Text style={[T.bodyMedium, { textAlign: "right" }]}>{adg(r.adgKg)}</Text>}
          onPress={(r) => setPicked(picked?.key === r.key ? null : r)}
          empty={{ title: t("ui.weighNone") }}
        />
      </>
    );
  return (
    <FarmFrame title={t("ui.herdSectionWeights")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.groups.length === 0 && d.animals.length === 0} empty={{ title: t("ui.weighNone"), hint: t("ui.weighNoneHint") }}>
        {(d) => (
          <View>
            {d.truncated && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.herdTruncated")}</Text>}
            {picked && (
              <View style={{ marginTop: 8 }}>
                <SectionHeader title={`${picked.label ?? t("ui.weighNoGroup")} · ${t("office.weighPeriodChart")}`} />
                <LineChart yUnit="kg" series={[{ label: picked.label ?? t("ui.weighNoGroup"), color: CHART.primary, points: picked.points.map((p) => ({ x: fmtDate(p.at), y: p.kg })) }]} />
                <KeyValue
                  rows={[
                    ...(picked.firstKg !== null ? [{ label: t("ui.weighFirst"), value: `${fmtNumber(picked.firstKg)} kg · ${fmtDate(picked.firstAt!)}` }] : []),
                    ...(picked.lastKg !== null ? [{ label: t("ui.weighLast"), value: `${fmtNumber(picked.lastKg)} kg · ${fmtDate(picked.lastAt!)}` }] : []),
                    ...(picked.days !== null ? [{ label: t("ui.weighDays"), value: fmtNumber(picked.days, 0) }] : []),
                    { label: t("ui.weighAdg"), value: adg(picked.adgKg) },
                    ...(picked.lastAdgKg !== null ? [{ label: t("ui.weighAdgRecent"), value: adg(picked.lastAdgKg) }] : []),
                  ]}
                />
              </View>
            )}
            {list(d.groups, t("ui.weighGroups"))}
            {list(d.animals, t("ui.weighAnimals"))}
            <Text style={[T.small, { marginTop: 16 }]}>{t("ui.weighHint")}</Text>
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
