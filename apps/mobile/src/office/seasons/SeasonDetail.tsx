/** Detalle de la campaña elegida: fechas, plan por lote y acciones de cierre y borrado. */
import { areaLabel, haToArea, isoToDisplay, t } from "@yvy/shared";
import type { Plot } from "../../db/store";
import type { PlanLite } from "../../lib/plotInfo";
import type { useUnits } from "../../lib/units";
import { Row, SectionHeader, Text } from "../../ui/kit";
import { C, T } from "../../ui/theme";
import { FarmChips, type useFarmPick } from "../farmPick";
import { fmtNumber } from "../format";
import { DataList, StatRow } from "../ui";
import { planText } from "./plan";
import type { SeasonEditor } from "./useSeasonEditor";

/** Campaña con sus fechas, tal como la guarda el celular. */
interface SeasonView {
  id: string;
  name: string;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
}

interface Props {
  season: SeasonView;
  plots: Plot[];
  planOf: (plotId: string) => PlanLite | undefined;
  canEdit: boolean;
  editor: SeasonEditor;
  units: ReturnType<typeof useUnits>;
  farms: ReturnType<typeof useFarmPick>;
}

/** Estado y fechas de la campaña en una línea. */
function seasonLine(s: SeasonView): string {
  const dates = s.startDate || s.endDate ? `${s.startDate ? isoToDisplay(s.startDate) : "—"} → ${s.endDate ? isoToDisplay(s.endDate) : "—"}` : null;
  return [s.active ? t("ui.season.active") : t("ui.season.closed"), dates].filter(Boolean).join(", ");
}

function PlanSummary({ plots, planOf, units }: Pick<Props, "plots" | "planOf" | "units">) {
  const planned = plots.filter((p) => planOf(p.id));
  if (plots.length === 0 || planned.length === 0) return null;
  const area = planned.reduce((a, p) => a + p.areaHa, 0);
  return <StatRow items={[{ label: t("office.seasons.withPlan"), value: `${planned.length}/${plots.length}` }, { label: t("office.seasons.planArea"), value: fmtNumber(haToArea(area, units.area), 0), unit: areaLabel(units.area) }]} />;
}

function ManageRows({ season, editor }: Pick<Props, "season" | "editor">) {
  return (
    <>
      <SectionHeader title={t("office.season.manage")} />
      <Row title={season.active ? t("ui.season.close") : t("ui.season.reopen")} subtitle={season.active ? t("office.season.closeHint") : undefined} chevron onPress={() => void editor.toggleActive()} />
      <Row title={t("ui.season.delete")} tone="danger" onPress={editor.askDelete} />
      {editor.toggleError ? (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 8 }]}>
          {editor.toggleError}
        </Text>
      ) : null}
    </>
  );
}

/** Todo lo que se ve de la campaña elegida. */
export function SeasonDetail({ season, plots, planOf, canEdit, editor, units, farms }: Props) {
  return (
    <>
      <Text style={[T.small, { marginTop: 12 }]}>{seasonLine(season)}</Text>
      <FarmChips farms={farms.farms} value={farms.farm?.id} onChange={farms.setFarmId} />
      <PlanSummary plots={plots} planOf={planOf} units={units} />
      <SectionHeader title={t("ui.season.planTitle")} />
      <DataList rows={plots} keyOf={(p) => p.id} title={(p) => p.name} subtitle={(p) => planText(planOf(p.id))} onPress={canEdit ? editor.openPlan : undefined} empty={{ title: t("ui.no.plots") }} />
      {canEdit && <ManageRows season={season} editor={editor} />}
    </>
  );
}
