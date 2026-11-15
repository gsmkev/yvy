/** Abigeato (función 74): faltantes con fecha, categoría, cabezas y denuncia. GET /org/farms/:id/theft. El alta es Anotar, Abigeato. */
import { View } from "react-native";
import { t, type MessageKey, type TheftResponse } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, StatRow } from "../../../src/office/ui";
import { Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

export default function Theft() {
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<TheftResponse>(farm ? `/org/farms/${farm.id}/theft` : null);
  return (
    <FarmFrame title={t("ui.herdSectionTheft")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.rows.length === 0} empty={{ title: t("ui.theftNone"), hint: t("ui.theftNoneHint") }}>
        {(d) => (
          <View>
            <StatRow
              items={[
                { label: t("fields.head"), value: d.totals.head },
                ...(d.totals.withoutReport > 0 ? [{ label: t("ui.theftNoReport"), value: d.totals.withoutReport, tone: "danger" as const }] : []),
              ]}
            />
            {d.totals.withoutReport > 0 && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.theftWithoutReport", { n: d.totals.withoutReport })}</Text>}
            {d.truncated && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.herdTruncated")}</Text>}
            <DataList
              rows={d.rows}
              keyOf={(r) => r.id}
              title={(r) => `${t(`fields.herd_${r.category}` as MessageKey)} · ${t("fields.herdTotalValue", { n: r.head })}`}
              subtitle={(r) => [fmtDate(r.capturedAt), r.plotName].filter(Boolean).join(" · ")}
              right={(r) =>
                r.policeReport ? (
                  <Text style={[T.smallMedium, { textAlign: "right" }]}>{`${r.policeReport}${r.reportedAt ? ` · ${fmtDate(r.reportedAt)}` : ""}`}</Text>
                ) : (
                  <Text style={[T.smallMedium, { textAlign: "right", color: C.peligro }]}>{t("ui.theftNoReport")}</Text>
                )
              }
              empty={{ title: t("ui.theftNone") }}
            />
            <Text style={[T.small, { marginTop: 16 }]}>{t("ui.theftHint")}</Text>
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
