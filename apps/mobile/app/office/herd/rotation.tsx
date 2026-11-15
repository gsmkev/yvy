/** Rotación de potreros (función 68): ocupación, descanso y próximo potrero sugerido. GET /org/farms/:id/rotation. */
import { View } from "react-native";
import { t, type MessageKey, type RotationResponse } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList } from "../../../src/office/ui";
import { Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

const days = (v: number | null) => (v === null ? null : fmtNumber(v, 0));

export default function Rotation() {
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<RotationResponse>(farm ? `/org/farms/${farm.id}/rotation` : null);
  return (
    <FarmFrame title={t("ui.herdSectionRotation")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.plots.length === 0} empty={{ title: t("office.rotNoPaddocks"), hint: t("ui.herdNoPaddocksHint") }}>
        {(d) => (
          <View>
            <View style={{ marginTop: 16 }}>
              {d.suggested ? (
                <>
                  <Text style={T.smallMedium}>{t("office.rotNextLabel")}</Text>
                  <Text style={T.heading}>{d.suggested.name}</Text>
                  <Text style={T.small}>
                    {[d.suggested.restDays === null ? t("ui.rotNoHistory") : t("ui.rotRestedDays", { n: fmtNumber(d.suggested.restDays, 0) }), d.suggested.pastureReady === true ? t("ui.rotPastureOk") : d.suggested.pastureReady === null ? t("ui.rotPastureUnknown") : null].filter(Boolean).join(" · ")}
                  </Text>
                </>
              ) : (
                <Text style={T.small}>{t("ui.rotNoneReady")}</Text>
              )}
            </View>
            {d.truncated && <Text style={[T.small, { marginTop: 8 }]}>{t("ui.herdTruncated")}</Text>}
            <DataList
              rows={d.plots}
              keyOf={(p) => p.plotId}
              title={(p) => `${p.name}${d.suggested?.plotId === p.plotId ? ` · ${t("ui.rotNext")}` : ""}`}
              subtitle={(p) =>
                [
                  t(`ui.rotState_${p.state}` as MessageKey),
                  p.occupied && p.stayDays !== null ? t("office.rotDaysStay", { n: days(p.stayDays) ?? "" }) : null,
                  !p.occupied && p.restDays !== null ? t("office.rotDaysRest", { n: days(p.restDays) ?? "" }) : null,
                  p.pasture ? `${p.pasture.heightCm} cm · ${t(`fields.level_${p.pasture.cover}` as MessageKey).toLowerCase()} · ${fmtDate(p.pasture.at)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              right={(p) =>
                p.state === "overdue" ? (
                  <Text style={[T.smallMedium, { textAlign: "right", color: C.peligro }]}>{t("office.rotMove")}</Text>
                ) : p.head > 0 ? (
                  <Text style={[T.small, { textAlign: "right" }]}>{t("fields.herdTotalValue", { n: p.head })}</Text>
                ) : null
              }
              empty={{ title: t("office.rotNoPaddocks") }}
            />
            <Text style={[T.small, { marginTop: 16 }]}>{t("ui.rotHint", { rest: d.defaults.minRestDays, max: d.defaults.maxOccupancyDays, height: d.defaults.minEntryHeightCm })}</Text>
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
