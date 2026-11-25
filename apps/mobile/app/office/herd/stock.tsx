/** Existencias por potrero, UA y límite de carga. Se calcula con los conteos y movimientos del celular; el límite viene de la estancia. */
import { Settings2 } from "lucide-react-native";
import { DEFAULT_MAX_UA_PER_HA, PRODUCTION_SYSTEMS, t, type FarmStockResponse, type MessageKey, type ProductionResponse, type ProductionSystem } from "@yvy/shared";
import { getSession } from "../../../src/lib/session";
import { useUnits } from "../../../src/lib/units";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { FarmFrame } from "../../../src/office/hub";
import { herdRows, herdTotals } from "../../../src/office/herdStock/model";
import { Indicators, PlotList, StockTotals, SystemLine } from "../../../src/office/herdStock/StockParts";
import { useLimitSheet, useSystemSheet } from "../../../src/office/herdStock/useStockSettings";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, FormSheet, SelectField, TextField } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

/** Hacienda por potrero, calculada con los conteos del celular. */
export default function Stock() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const role = getSession()?.organization.role;
  const remote = useOnline<FarmStockResponse>(farm ? `/org/farms/${farm.id}/stock` : null);
  const system = remote.data?.system ?? null;
  const prod = useOnline<ProductionResponse>(farm && system ? `/org/farms/${farm.id}/production` : null);
  const rows = useLocal(() => (farm ? herdRows(farm.id) : null), [farm?.id]) ?? [];
  const maxUa = remote.data?.maxUaPerHa ?? DEFAULT_MAX_UA_PER_HA;
  const { head, ua, farmUaHa, over } = herdTotals(rows, maxUa);
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
      <FormSheet visible={limit.open} title={t("ui.herd.limitLabel")} onClose={limit.close} onSubmit={limit.submit} submitLabel={t("ui.common.save")} pending={limit.pending} error={limit.error}>
        <TextField label={t("ui.herd.limitLabel")} hint={t("ui.herd.limitHint")} value={limit.text} onChangeText={limit.setText} kind="decimal" />
      </FormSheet>
      <FormSheet visible={sys.open} title={t("ui.herd.sysQuestion")} onClose={sys.close} onSubmit={sys.submit} submitLabel={t("ui.common.save")} pending={sys.pending} error={sys.error}>
        <SelectField<ProductionSystem> label={t("ui.herd.sysLabel")} value={sys.pick || undefined} options={PRODUCTION_SYSTEMS.map((v) => ({ value: v, label: `${t(`ui.herd.sys_${v}` as MessageKey)} · ${t(`ui.herd.sysHint_${v}` as MessageKey)}` }))} onChange={sys.setPick} />
      </FormSheet>
    </FarmFrame>
  );
}
