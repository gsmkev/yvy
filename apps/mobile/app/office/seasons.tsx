/**
 * Campañas: campañas y plan de cultivo por lote desde la base local (anda sin señal). Crear campaña,
 * planificar un lote, cerrar/reabrir y borrar van por REST (POST/PATCH/DELETE /org/seasons, PUT /org/seasons/:id/plots/:id)
 * y solo para dueño, administrador y agrónomo; el supervisor las ve. Después de guardar se sincroniza.
 */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react-native";
import { isFieldRole, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { localPlans, localSeasons } from "../../src/lib/plotInfo";
import { useSession } from "../../src/lib/session";
import { useUnits } from "../../src/lib/units";
import { useLocal } from "../../src/lib/useLocal";
import { useFarmPick } from "../../src/office/farmPick";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { SeasonDetail } from "../../src/office/seasons/SeasonDetail";
import { CreateSeasonSheet, DeleteSeasonSheet, PlanSheet } from "../../src/office/seasons/SeasonSheets";
import { useSeasonEditor } from "../../src/office/seasons/useSeasonEditor";
import { FilterChips } from "../../src/office/ui";
import { EmptyState } from "../../src/ui/kit";

const can = (role: string | undefined) => role === "owner" || role === "admin" || role === "agronomist";

/** Campañas: listado, alta y cierre. */
export default function Seasons() {
  const role = useSession()?.organization.role;
  const canEdit = !!role && !isFieldRole(role) && can(role);
  const units = useUnits();
  const farms = useFarmPick();
  const { farm } = farms;
  const data = useLocal(() => {
    const db = getDb();
    return { seasons: localSeasons(db), plans: localPlans(db), plots: db.plots() };
  });
  const [picked, setPicked] = useState<string | null>(null);
  const season = data.seasons.find((s) => s.id === picked) ?? data.seasons.find((s) => s.active) ?? data.seasons[0] ?? null;
  const plots = useMemo(() => data.plots.filter((p) => p.kind === "crop" && (!farm || p.farmId === farm.id)), [data.plots, farm]);
  const planOf = (plotId: string) => (season ? data.plans.find((p) => p.plotId === plotId && p.seasonId === season.id) : undefined);
  const editor = useSeasonEditor(season, planOf, setPicked);

  return (
    <OfficeScreen title={t("ui.common.seasonsTitle")} action={canEdit ? { label: t("ui.season.new"), icon: Plus, onPress: editor.openCreate } : undefined}>
      {data.seasons.length === 0 ? (
        <EmptyState title={t("office.seasons.empty")} hint={canEdit ? t("ui.season.none") : t("office.seasons.emptyView")} />
      ) : (
        <>
          <FilterChips value={season?.id ?? ""} onChange={setPicked} options={data.seasons.map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name}, ${t("ui.season.closed")}` }))} />
          {season && <SeasonDetail season={season} plots={plots} planOf={planOf} canEdit={canEdit} editor={editor} units={units} farms={farms} />}
        </>
      )}
      <CreateSeasonSheet editor={editor} />
      <PlanSheet editor={editor} season={season} hasPlan={!!editor.planning && !!planOf(editor.planning.plotId)} />
      <DeleteSeasonSheet editor={editor} season={season} />
    </OfficeScreen>
  );
}
