/** Carencias y reingresos vigentes: lotes con restricción y cosechas hechas antes de cumplirla. GET /org/farms/:id/withdrawal. */
import { View } from "react-native";
import { t } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, StatRow } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

interface Resp {
  today: string;
  restrictions: { plotId: string; plotName: string; safeFrom: string; daysLeft: number; product: string; appliedOn: string }[];
  violations: { plotId: string; plotName: string; harvestedOn: string; safeFrom: string; product: string; appliedOn: string }[];
  unknown: { plotId: string; plotName: string; product: string; appliedOn: string }[];
}
const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Períodos de carencia vigentes por lote. */
export default function Withdrawal() {
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<Resp>(farm ? `/org/farms/${farm.id}/withdrawal` : null);
  return (
    <FarmFrame title={t("ui.withdrawal.title")} subtitle={t("ui.withdrawal.intro")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.restrictions.length + d.violations.length + d.unknown.length === 0} empty={{ title: t("office.withdrawal.empty"), hint: t("office.withdrawal.emptyHint") }}>
        {(d) => (
          <View>
            {(d.restrictions.length > 0 || d.violations.length > 0) && <StatRow
              items={[
                ...(d.restrictions.length > 0 ? [{ label: t("ui.withdrawal.title"), value: d.restrictions.length, tone: "danger" as const }] : []),
                ...(d.violations.length > 0 ? [{ label: t("ui.withdrawal.violations"), value: d.violations.length, tone: "danger" as const }] : []),
              ]}
            />}
            {d.restrictions.length > 0 && (
              <DataList
                rows={d.restrictions}
                keyOf={(r) => `${r.plotId}${r.product}${r.appliedOn}`}
                title={(r) => r.plotName}
                subtitle={(r) => String(t("ui.withdrawal.applied", { product: r.product, date: dmy(r.appliedOn) }))}
                right={(r) => (
                  <>
                    <Text style={[T.smallMedium, { textAlign: "right", color: C.peligro }]}>{t("ui.withdrawal.until", { date: dmy(r.safeFrom) })}</Text>
                    <Text style={[T.small, { textAlign: "right" }]}>{t(r.daysLeft === 1 ? "ui.withdrawal.dayOne" : "ui.withdrawal.days", { n: r.daysLeft })}</Text>
                  </>
                )}
                empty={{ title: t("office.withdrawal.empty") }}
              />
            )}
            {d.violations.length > 0 && (
              <>
                <SectionHeader title={t("ui.withdrawal.violations")} />
                {d.violations.map((v) => (
                  <Text key={`${v.plotId}${v.harvestedOn}${v.product}`} style={[T.body, { color: C.peligro, marginBottom: 8 }]}>
                    {t("ui.withdrawal.violation", { plot: v.plotName, date: dmy(v.harvestedOn), product: v.product, safe: dmy(v.safeFrom) })}
                  </Text>
                ))}
              </>
            )}
            {d.unknown.length > 0 && (
              <>
                <SectionHeader title={t("ui.withdrawal.unknown")} />
                <Text style={T.small}>{d.unknown.map((u) => `${u.product} (${u.plotName})`).join(", ")}</Text>
              </>
            )}
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
