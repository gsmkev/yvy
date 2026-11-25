/** Forraje y pasturas: oferta estimada por potrero y días de pasto. GET /org/farms/:id/forage. */
import { View } from "react-native";
import { t, type ForageResponse, type MessageKey } from "@yvy/shared";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList } from "../../../src/office/ui";
import { Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

/** Forraje disponible por potrero. */
export default function Forage() {
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<ForageResponse>(farm ? `/org/farms/${farm.id}/forage` : null);
  return (
    <FarmFrame title={t("ui.herd.sectionForage")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.plots.length === 0} empty={{ title: t("office.rot.noPaddocks"), hint: t("ui.herd.noPaddocksHint") }}>
        {(d) => {
          const c = d.coefficients;
          return (
            <View>
              <DataList
                rows={d.plots}
                keyOf={(p) => p.plotId}
                title={(p) => p.name}
                subtitle={(p) =>
                  [
                    p.heightCm !== null ? `${p.heightCm} cm · ${t(`fields.level.${p.cover}` as MessageKey).toLowerCase()}` : p.ndvi !== null ? `NDVI ${fmtNumber(p.ndvi, 2)}` : null,
                    p.kgDmHa !== null ? `${fmtNumber(p.kgDmHa, 0)} kg MS/ha` : null,
                    p.stale ? t("ui.forage.stale") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                right={(p) =>
                  p.kgDmHa === null ? (
                    <Text style={[T.small, { textAlign: "right" }]}>{t("ui.forage.noData")}</Text>
                  ) : (
                    <Text style={[T.bodyMedium, { textAlign: "right", color: p.daysLeft !== null && p.daysLeft < 5 ? C.peligro : C.tinta }]}>{p.daysLeft === null ? "—" : `${fmtNumber(p.daysLeft, 0)} d`}</Text>
                  )
                }
                empty={{ title: t("office.rot.noPaddocks") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>
                {t("ui.forage.hint", { low: c.kgDmPerHaPerCm.low, mid: c.kgDmPerHaPerCm.medium, high: c.kgDmPerHaPerCm.high, base: fmtNumber(c.ndviBase, 2), slope: fmtNumber(c.ndviSlopeKgDmHa, 0), w: Math.round(c.heightWeight * 100), win: c.calibrationWindowDays, use: Math.round(c.utilization * 100), dm: c.dmPerUaDay })}
              </Text>
            </View>
          );
        }}
      </OnlineState>
    </FarmFrame>
  );
}
