/** Pesadas y ganancia diaria: por lote de animales y por animal, con la curva de peso al tocar una fila. GET /org/farms/:id/weighings. */
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

/** Pesadas del rodeo y su evolución. */
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
          title={(r) => r.label ?? t("ui.weigh.noGroup")}
          subtitle={(r) => (r.firstKg === null || r.lastKg === null ? undefined : t("office.weigh.seriesLine", { n: r.points.length, first: fmtNumber(r.firstKg), last: fmtNumber(r.lastKg) }))}
          right={(r) => <Text style={[T.bodyMedium, { textAlign: "right" }]}>{adg(r.adgKg)}</Text>}
          onPress={(r) => setPicked(picked?.key === r.key ? null : r)}
          empty={{ title: t("ui.weigh.none") }}
        />
      </>
    );
  return (
    <FarmFrame title={t("ui.herd.sectionWeights")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.groups.length === 0 && d.animals.length === 0} empty={{ title: t("ui.weigh.none"), hint: t("ui.weigh.noneHint") }}>
        {(d) => (
          <View>
            {d.truncated && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.herd.truncated")}</Text>}
            {picked && (
              <View style={{ marginTop: 8 }}>
                <SectionHeader title={`${picked.label ?? t("ui.weigh.noGroup")}, ${t("office.weigh.periodChart")}`} />
                <LineChart yUnit="kg" series={[{ label: picked.label ?? t("ui.weigh.noGroup"), color: CHART.primary, points: picked.points.map((p) => ({ x: fmtDate(p.at), y: p.kg })) }]} />
                <KeyValue
                  rows={[
                    ...(picked.firstKg !== null ? [{ label: t("ui.weigh.first"), value: `${fmtNumber(picked.firstKg)} kg, ${fmtDate(picked.firstAt!)}` }] : []),
                    ...(picked.lastKg !== null ? [{ label: t("ui.weigh.last"), value: `${fmtNumber(picked.lastKg)} kg, ${fmtDate(picked.lastAt!)}` }] : []),
                    ...(picked.days !== null ? [{ label: t("ui.weigh.days"), value: fmtNumber(picked.days, 0) }] : []),
                    { label: t("ui.weigh.adg"), value: adg(picked.adgKg) },
                    ...(picked.lastAdgKg !== null ? [{ label: t("ui.weigh.adgRecent"), value: adg(picked.lastAdgKg) }] : []),
                  ]}
                />
              </View>
            )}
            {list(d.groups, t("ui.weigh.groups"))}
            {list(d.animals, t("ui.weigh.animals"))}
            <Text style={[T.small, { marginTop: 16 }]}>{t("ui.weigh.hint")}</Text>
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
