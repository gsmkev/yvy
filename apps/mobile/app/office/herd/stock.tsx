/** Existencias por potrero, UA y límite de carga. Se calcula con los conteos y movimientos del celular; el límite viene de la estancia. */
import { Settings2 } from "lucide-react-native";
import { t } from "@yvy/shared";
import { getSession } from "../../../src/lib/session";
import { useUnits } from "../../../src/lib/units";
import { useFarmPick } from "../../../src/office/farmPick";
import { FarmFrame } from "../../../src/office/hub";
import { Indicators, LimitSheet, PlotList, StockTotals, SystemLine, SystemSheet } from "../../../src/office/herdStock/StockParts";
import { useLimitSheet, useStockData, useSystemSheet } from "../../../src/office/herdStock/useStockSettings";
import { DataList } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

/** Hacienda por potrero, calculada con los conteos del celular. */
export default function Stock() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const role = getSession()?.organization.role;
  const { remote, system, prod, rows, maxUa, totals } = useStockData(farm?.id);
  const { head, ua, farmUaHa, over } = totals;
  const refresh = () => void remote.refresh();
  const limit = useLimitSheet(farm?.id, maxUa, refresh);
  const sys = useSystemSheet(farm?.id, system, refresh);
  const editable = (role === "owner" || role === "admin") && !!farm;

  return (
    <FarmFrame title={t("office.herd.stockTitle")} farms={farms} farm={farm} setFarmId={setFarmId} query={remote} action={editable ? { label: t("office.herd.stockLimitEdit"), icon: Settings2, onPress: limit.show } : undefined}>
      {editable && remote.data && <SystemLine system={system} onChange={sys.show} />}
      {system === "tambo" && <Text style={T.small}>{t("ui.herd.sysTamboNote")}</Text>}
      {prod.data && <Indicators data={prod.data} />}
      {rows.length === 0 ? (
        <DataList rows={[]} keyOf={() => ""} title={() => ""} empty={{ title: t("office.herd.stockEmpty"), hint: t("office.herd.stockEmptyHint") }} />
      ) : (
        <>
          <StockTotals head={head} ua={ua} farmUaHa={farmUaHa} over={over} maxUa={maxUa} isDefault={!remote.data || remote.data.maxUaIsDefault} />
          <SectionHeader title={t("ui.common.plots")} />
          <PlotList rows={rows} maxUa={maxUa} areaUnit={units.area} plots={remote.data?.plots ?? []} />
        </>
      )}
      {remote.data && <Text style={[T.small, { marginTop: 12 }]}>{`${t("ui.herd.loadHint")}${remote.data.winter ? ` ${t("ui.herd.loadWinter")}` : ""}`}</Text>}
      <LimitSheet sheet={limit} />
      <SystemSheet sheet={sys} />
    </FarmFrame>
  );
}
