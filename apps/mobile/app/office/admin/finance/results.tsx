/**
 * Resultados y márgenes (función 131): costos, ventas y margen bruto por lote, cultivo, campaña y actividad.
 * API: GET /org/erp/results?farmId&seasonId (apps/api/src/routes/erp/). Solo lectura.
 */
import { useState } from "react";
import { View } from "react-native";
import { t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../../../src/lib/db";
import { useLocal } from "../../../../src/lib/useLocal";
import { MoneyStats, NoAdminAccess, useErp, useManageErp, useSeasonList } from "../../../../src/office/erpCommon";
import { fmtNumber } from "../../../../src/office/format";
import { fmtGs } from "../../../../src/office/money";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { OnlineState } from "../../../../src/office/state";
import { BarList, DataList, Segmented, SelectField } from "../../../../src/office/ui";
import { SectionHeader, Text } from "../../../../src/ui/kit";
import { C, T } from "../../../../src/ui/theme";
import type { ResultsResponse as Results } from "@yvy/shared";

type View_ = "plot" | "crop" | "season" | "activity";
const key = (k: string) => k as MessageKey;

interface Line {
  id: string;
  name: string;
  detail?: string;
  margin: number;
  marginPerHa?: number | null;
}

const rowsOf = (d: Results, view: View_): Line[] => {
  switch (view) {
    case "plot":
      return d.byPlot.map((r) => ({ id: r.plotId ?? "none", name: r.name ?? t("ui.resultsNoPlot"), detail: [r.areaHa ? `${fmtNumber(r.areaHa)} ha` : null, `${t("ui.costTotalCost")} ${fmtGs(r.costPyg)}`, `${t("ui.costTotalIncome")} ${fmtGs(r.incomePyg)}`].filter(Boolean).join(" · "), margin: r.marginPyg, marginPerHa: r.marginPerHa }));
    case "crop":
      return d.byCrop.map((r) => ({ id: r.crop ?? "none", name: r.crop ? t(key(`ui.cropName_${r.crop}`)) : t("ui.dashNoCrop"), detail: [r.areaHa ? `${fmtNumber(r.areaHa)} ha` : null, `${t("ui.costTotalCost")} ${fmtGs(r.costPyg)}`, `${t("ui.costTotalIncome")} ${fmtGs(r.incomePyg)}`].filter(Boolean).join(" · "), margin: r.marginPyg, marginPerHa: r.marginPerHa }));
    case "season":
      return d.bySeason.map((r) => ({ id: r.seasonId ?? "none", name: r.name ?? t("ui.resultsNoSeason"), detail: `${t("ui.costTotalCost")} ${fmtGs(r.costPyg)} · ${t("ui.costTotalIncome")} ${fmtGs(r.incomePyg)}`, margin: r.marginPyg }));
    case "activity":
      return d.byActivity.map((r) => ({ id: r.activity, name: t(key(`ui.activity_${r.activity}`)), detail: `${t("ui.costTotalCost")} ${fmtGs(r.costPyg)} · ${t("ui.costTotalIncome")} ${fmtGs(r.incomePyg)}`, margin: r.marginPyg }));
  }
};

export default function ResultsScreen() {
  const allowed = useManageErp();
  const [farmId, setFarmId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [view, setView] = useState<View_>("plot");
  const farms = useLocal(() => getDb().farms());
  const seasons = useSeasonList();
  const qs = [farmId && `farmId=${farmId}`, seasonId && `seasonId=${seasonId}`].filter(Boolean).join("&");
  const q = useErp<Results>(allowed ? `/org/erp/results${qs ? `?${qs}` : ""}` : null);
  if (!allowed) return <NoAdminAccess title={t("ui.adminSection_results")} />;
  const filtered = !!(farmId || seasonId);
  const none = t("ui.costAll");
  const hasData = (d: Results) => d.totals.costPyg !== 0 || d.totals.incomePyg !== 0 || d.byPlot.some((r) => r.costPyg !== 0 || r.incomePyg !== 0);

  return (
    <OfficeScreen title={t("ui.adminSection_results")} query={q}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SelectField label={t("ui.costSeason")} value={seasonId} options={[{ value: "", label: none }, ...(seasons.data?.seasons ?? []).map((s) => ({ value: s.id, label: s.name }))]} onChange={setSeasonId} />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField label={t("ui.costFarm")} value={farmId} options={[{ value: "", label: none }, ...farms.map((f) => ({ value: f.id, label: f.name }))]} onChange={setFarmId} />
        </View>
      </View>
      <OnlineState
        query={q}
        isEmpty={(d) => !hasData(d)}
        empty={filtered ? { title: t("ui.resultsEmptyFiltered"), hint: t("ui.resultsEmptyFilteredHint"), action: t("ui.costClearFilters"), onAction: () => (setFarmId(""), setSeasonId("")) } : { title: t("ui.resultsEmptyTitle"), hint: t("office.resultsEmptyHintApp") }}
      >
        {(d) => {
          const tt = d.totals;
          const rows = rowsOf(d, view);
          const perHa = rows.filter((r) => r.marginPerHa !== undefined && r.marginPerHa !== null).map((r) => ({ label: r.name, value: Math.round(r.marginPerHa ?? 0) }));
          return (
            <>
              <MoneyStats
                items={[
                  { label: t("ui.costTotalCost"), value: fmtGs(tt.costPyg) },
                  { label: t("ui.costTotalIncome"), value: fmtGs(tt.incomePyg) },
                  { label: t("ui.resultsMargin"), value: fmtGs(tt.marginPyg), tone: tt.marginPyg < 0 ? "danger" : undefined },
                ]}
              />
              <View style={{ marginTop: 20 }}>
                <Segmented<View_>
                  options={[
                    { value: "plot", label: t("office.resultsViewPlot") },
                    { value: "crop", label: t("office.resultsViewCrop") },
                    { value: "season", label: t("office.resultsViewSeason") },
                    { value: "activity", label: t("office.resultsViewActivity") },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </View>
              <DataList
                rows={rows}
                keyOf={(r) => r.id}
                title={(r) => r.name}
                subtitle={(r) => r.detail}
                right={(r) => <Text style={[T.bodyMedium, r.margin < 0 && { color: C.peligro }]}>{fmtGs(r.margin)}</Text>}
                empty={{ title: t("ui.resultsEmptyView") }}
              />
              {perHa.length > 0 ? (
                <>
                  <SectionHeader title={t("ui.resultsMarginPerHa")} />
                  <BarList rows={perHa} unit="Gs/ha" />
                </>
              ) : null}
              {d.beef.costPerKgPyg !== null ? <Text style={[T.small, { marginTop: 16 }]}>{t("ui.resultsBeefKg", { cost: fmtGs(d.beef.costPerKgPyg), kg: fmtNumber(d.beef.kgSold, 0) })}</Text> : null}
            </>
          );
        }}
      </OnlineState>
    </OfficeScreen>
  );
}
