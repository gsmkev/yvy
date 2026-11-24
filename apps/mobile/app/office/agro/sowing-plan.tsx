/** Plan de siembra: superficie por cultivo y variedad y semilla a comprar. GET /org/seasons?farmId= más los lotes del celular. */
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { CROPS, sowingPlan, t, type MessageKey, areaLabel, haToArea } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { useUnits } from "../../../src/lib/units";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, FilterChips, StatRow } from "../../../src/office/ui";
import { Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

type Crop = (typeof CROPS)[number];
interface Resp {
  seasons: { id: string; name: string; active: boolean }[];
  plotSeasons: { plotId: string; seasonId: string; crop: string | null; variety: string | null; sowingDensity: number | null; densityUnit: string | null }[];
}

/** Plan de siembra de la campaña. */
export default function SowingPlan() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const q = useOnline<Resp>(farm ? `/org/seasons?farmId=${farm.id}` : null);
  const plots = useLocal(() => (farm ? getDb().plots(farm.id) : []), [farm?.id]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const seasons = q.data?.seasons ?? [];
  useEffect(() => {
    if (!seasonId || !seasons.some((s) => s.id === seasonId)) setSeasonId((seasons.find((s) => s.active) ?? seasons[0])?.id ?? null);
  }, [q.data]);
  const plan = useMemo(
    () => (seasonId && q.data ? sowingPlan(plots.map((p) => ({ id: p.id, kind: p.kind, areaHa: p.areaHa })), q.data.plotSeasons.map((p) => ({ ...p, crop: p.crop as Crop | null })), seasonId) : null),
    [plots, q.data, seasonId],
  );
  const area = (ha: number) => `${fmtNumber(haToArea(ha, units.area))} ${areaLabel(units.area)}`;
  return (
    <FarmFrame title={t("ui.sow.planTitle")} farms={farms} farm={farm} setFarmId={setFarmId} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.seasons.length === 0} empty={{ title: t("office.sow.planNoSeasons"), hint: t("office.sow.planNoSeasonsHint") }}>
        {() => (
          <View>
            {seasons.length > 1 && <FilterChips value={seasonId ?? ""} onChange={setSeasonId} options={seasons.map((s) => ({ value: s.id, label: s.name }))} />}
            {plan && plan.rows.length === 0 && <Text style={[T.body, { marginTop: 20 }]}>{t("ui.sow.planEmpty")}</Text>}
            {plan && plan.rows.length > 0 && (
              <>
                <StatRow items={[{ label: t("ui.sow.planArea"), value: fmtNumber(haToArea(plan.plannedHa, units.area)), unit: areaLabel(units.area) }, { label: t("ui.sow.planSeed"), value: fmtNumber(plan.rows.reduce((n, r) => n + r.seedKg, 0), 0), unit: "kg" }]} />
                <DataList
                  rows={plan.rows}
                  keyOf={(r) => `${r.crop}-${r.variety ?? ""}`}
                  title={(r) => `${t(`fields.crop.${r.crop}` as MessageKey)}${r.variety ? ` · ${r.variety}` : ""}`}
                  subtitle={(r) =>
                    t(r.plots === 1 ? "ui.plots.countOne" : "ui.plots.countMany", { n: r.plots }) +
                    " · " +
                    area(r.areaHa)
                  }
                  right={(r) => t("office.sow.planSeedKg", { kg: fmtNumber(r.seedKg, 0) })}
                  empty={{ title: t("ui.sow.planEmpty") }}
                />
                {plan.unplannedPlots > 0 && <Text style={[T.small, { marginTop: 12 }]}>{t("ui.sow.planUnplanned", { n: plan.unplannedPlots, area: area(plan.unplannedHa) })}</Text>}
                <Text style={[T.small, { marginTop: 12 }]}>{t("ui.sow.planRateNote")}</Text>
              </>
            )}
          </View>
        )}
      </OnlineState>
    </FarmFrame>
  );
}
