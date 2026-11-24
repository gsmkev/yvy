/** Encabezado del panel: selector de estancia, acciones, ubicación y superficies. */
import { useNavigate } from "@tanstack/react-router";
import { Button, PageHeader, Stat } from "../../components/ui";
import { ActionMenu } from "../../components/menus";
import { areaUnitLabel, fmtAreaValue } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { FarmDetail, FarmSummary } from "../../lib/types";
import type { FarmEditing } from "./useFarmEditing";

/** Encabezado del panel: selector de estancia, acciones, ubicación y superficies. */
export function FarmHeader({
  d,
  farmId,
  farms,
  canEdit,
  edit,
  onPrint,
}: {
  d: FarmDetail;
  farmId: string;
  farms: FarmSummary[] | undefined;
  canEdit: boolean;
  edit: FarmEditing;
  onPrint: () => void;
}) {
  const navigate = useNavigate();
  const { mode, setMode } = edit;
  const cropHa = d.plots.filter((p) => p.kind === "crop").reduce((a, p) => a + p.areaHa, 0);
  const pastureHa = d.plots.filter((p) => p.kind === "pasture").reduce((a, p) => a + p.areaHa, 0);
  return (
    <div>
      <PageHeader
        title={d.farm.name}
        stacked
        titleAction={
          <ActionMenu
            icon="chevron"
            label={t("ui.farm.switch")}
            items={[
              (farms?.length ?? 0) > 1 && { label: t("ui.all.farms"), onSelect: () => navigate({ to: "/" }) },
              ...(farms ?? []).map((f) => ({
                label: f.name,
                disabled: f.id === farmId,
                onSelect: () => navigate({ to: "/estancias/$farmId", params: { farmId: f.id }, search: {} }),
              })),
              canEdit && { label: t("ui.new.farm"), onSelect: () => navigate({ to: "/estancias/nueva" }) },
            ]}
          />
        }
        primary={
          canEdit && (
            <Button variant="primary" onClick={() => setMode(mode === "draw" ? "none" : "draw")}>
              {t("ui.new.plot")}
            </Button>
          )
        }
        menu={
          <>
            <ActionMenu
              label={t("ui.common.moreActions")}
              items={[
                canEdit && { label: t("ui.import.short"), onSelect: () => setMode("import") },
                canEdit && { label: t("ui.add.poi"), onSelect: () => setMode(mode === "poi" ? "none" : "poi") },
                canEdit && {
                  label: t("ui.tab.report"),
                  onSelect: () => navigate({ to: "/estancias/$farmId/parte", params: { farmId }, search: { desde: undefined, hasta: undefined } }),
                },
                { label: t("ui.common.print"), onSelect: onPrint },
              ]}
            />
          </>
        }
      />
      {(d.farm.district || d.farm.department) && (
        <p className="mt-1 text-sm text-tinta-2">{[d.farm.district, d.farm.department].filter(Boolean).join(", ")}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat label={t("ui.common.area")} value={fmtAreaValue(d.farm.areaHa)} unit={areaUnitLabel()} />
        <Stat label={t("ui.common.plots")} value={d.plots.length} />
        {cropHa > 0 && <Stat label={t("ui.common.crop")} value={fmtAreaValue(cropHa)} unit={areaUnitLabel()} />}
        {pastureHa > 0 && <Stat label={t("ui.common.pasture")} value={fmtAreaValue(pastureHa)} unit={areaUnitLabel()} />}
      </div>
    </div>
  );
}
