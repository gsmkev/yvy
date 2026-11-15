/** Reproducción (función 71): índices de preñez, parición y destete y los últimos eventos. GET /org/farms/:id/reproduction. El alta es Anotar, Reproducción. */
import { useState } from "react";
import { View } from "react-native";
import { t, type MessageKey, type ReproductionResponse } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, FilterChips, StatRow, type StatItem } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

const DAY = 86_400_000;
const pct = (v: number | null) => (v === null ? null : `${fmtNumber(v)} %`);

export default function Repro() {
  const { farms, farm, setFarmId } = useFarmPick();
  const [days, setDays] = useState("365");
  const from = Math.floor(Date.now() / DAY) * DAY - Number(days) * DAY;
  const q = useOnline<ReproductionResponse>(farm ? `/org/farms/${farm.id}/reproduction?from=${from}` : null);
  return (
    <FarmFrame title={t("ui.herdSectionRepro")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <FilterChips
        value={days}
        onChange={setDays}
        options={[
          { value: "180", label: t("ui.suppDays", { n: 180 }) },
          { value: "365", label: t("ui.reproYear") },
          { value: "730", label: t("ui.reproTwoYears") },
        ]}
      />
      <OnlineState query={q} isEmpty={(d) => d.rows.length === 0} empty={{ title: t("ui.reproNone"), hint: t("ui.reproNoneHint") }}>
        {(d) => {
          const i = d.indices;
          const stats: StatItem[] = [
            ...(pct(i.pregnancyPct) ? [{ label: t("ui.reproPregnancy"), value: pct(i.pregnancyPct)! }] : []),
            ...(pct(i.calvingPct) ? [{ label: t("ui.reproCalving"), value: pct(i.calvingPct)! }] : []),
            ...(pct(i.weaningPct) ? [{ label: t("ui.reproWeaning"), value: pct(i.weaningPct)! }] : []),
          ];
          const notes = [
            i.pregnancyPct !== null ? t("ui.reproPregnancyHint", { p: i.pregnant, c: i.checked }) : null,
            i.calvingPct !== null ? t("ui.reproCalvingHint", { b: i.calvesBorn, s: i.services }) : null,
            i.weaningPct !== null ? t("ui.reproWeaningHint", { w: i.weaned, b: i.calvesBorn }) : null,
          ].filter(Boolean) as string[];
          return (
            <View>
              {stats.length > 0 && <StatRow items={stats} />}
              <View style={{ marginTop: 8, gap: 2 }}>
                {notes.map((n) => (
                  <Text key={n} style={T.small}>
                    {n}
                  </Text>
                ))}
              </View>
              {d.truncated && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.herdTruncated")}</Text>}
              <SectionHeader title={t("ui.reproDetail")} />
              <DataList
                rows={d.rows}
                keyOf={(r) => r.id}
                title={(r) => `${t(`fields.reproEvent_${r.event}` as MessageKey)}${r.plotName ? ` · ${r.plotName}` : ""}`}
                subtitle={(r) =>
                  [
                    fmtDate(r.capturedAt),
                    r.method ? t(`fields.reproMethod_${r.method}` as MessageKey) : null,
                    r.pregnant !== null ? t("fields.reproPregnantValue", { n: r.pregnant }) : null,
                    r.calves !== null ? t("fields.reproCalvesValue", { n: r.calves }) : null,
                    r.tag ? t("fields.tagValue", { n: r.tag }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }
                right={(r) => t("fields.herdTotalValue", { n: r.head })}
                empty={{ title: t("ui.reproNone") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>{t("ui.reproHint")}</Text>
            </View>
          );
        }}
      </OnlineState>
    </FarmFrame>
  );
}
