/** Suplementación y sal mineral: kilos por potrero y sal por cabeza y día. GET /org/farms/:id/supplements. El alta es Anotar, Suplementación. */
import { useState } from "react";
import { View } from "react-native";
import { SUPPLEMENT_TYPES, t, type MessageKey, type SupplementResponse } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, FilterChips, StatRow } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

const DAY = 86_400_000;

/** Suplementación del rodeo. */
export default function Supplements() {
  const { farms, farm, setFarmId } = useFarmPick();
  const [days, setDays] = useState("30");
  const from = Math.floor(Date.now() / DAY) * DAY - Number(days) * DAY;
  const q = useOnline<SupplementResponse>(farm ? `/org/farms/${farm.id}/supplements?from=${from}` : null);
  return (
    <FarmFrame title={t("ui.herd.sectionSupp")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <FilterChips value={days} onChange={setDays} options={["7", "30", "90"].map((v) => ({ value: v, label: t("ui.supp.days", { n: v }) }))} />
      <OnlineState query={q} isEmpty={(d) => d.plots.length === 0 || d.totals.kg === 0} empty={{ title: t("ui.supp.none"), hint: t("ui.supp.noneHint") }}>
        {(d) => {
          const used = SUPPLEMENT_TYPES.filter((k) => (d.totals.byType[k] ?? 0) > 0);
          const rows = d.plots.filter((p) => p.totalKg > 0);
          return (
            <View>
              <StatRow items={[{ label: t("ui.supp.kg"), value: fmtNumber(d.totals.kg, 0) }, ...used.map((k) => ({ label: t(`fields.supplement.type_${k}` as MessageKey), value: fmtNumber(d.totals.byType[k] ?? 0, 0), unit: "kg" }))]} />
              {d.truncated && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.herd.truncated")}</Text>}
              <SectionHeader title={t("ui.common.plots")} />
              <DataList
                rows={rows}
                keyOf={(p) => p.plotId}
                title={(p) => p.name}
                subtitle={(p) => [p.head ? t("fields.herd.totalValue", { n: p.head }) : null, p.lastAt ? `${t("ui.supp.last")}: ${fmtDate(p.lastAt)}` : null].filter(Boolean).join(", ") || undefined}
                right={(p) => (
                  <>
                    <Text style={[T.bodyMedium, { textAlign: "right" }]}>{`${fmtNumber(p.totalKg)} kg`}</Text>
                    {p.saltGPerHeadDay !== null && (
                      <Text style={[T.smallMedium, { textAlign: "right", color: p.saltStatus === "low" || p.saltStatus === "high" ? C.peligro : C.tinta2 }]}>
                        {`${fmtNumber(p.saltGPerHeadDay, 0)} g${p.saltStatus && p.saltStatus !== "ok" ? `, ${t(`ui.supp.salt_${p.saltStatus}` as MessageKey)}` : ""}`}
                      </Text>
                    )}
                  </>
                )}
                empty={{ title: t("ui.supp.none") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>{t("ui.supp.hint", { min: d.reference.min, max: d.reference.max })}</Text>
            </View>
          );
        }}
      </OnlineState>
    </FarmFrame>
  );
}
