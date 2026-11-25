/** Costo de la labor propia frente al contratista del mismo servicio. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Button, DataTable, EmptyState, ErrorBox, Spinner, toast } from "../ui";
import { SectionButton } from "./SectionButton";
import { useMachines } from "./MachinesPanel";
import { ExportableTable } from "../ExportableTable";
import { HeaderActions } from "./adminSlot";
import { ProfileModal, type Profile } from "./labor/ProfileModal";
import { laborColumns, type Row } from "./labor/laborColumns";

/** Costo de la labor propia frente al del contratista. */
export function LaborCostPanel() {
  const rows = useQuery({ queryKey: ["erp", "labor-cost"], queryFn: () => get<Row[]>("/org/erp/labor-cost") });
  const machines = useMachines();
  const profiles = useQuery({ queryKey: ["erp", "machine-costs"], queryFn: () => get<Profile[]>("/org/erp/machine-costs") });
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/machine-costs/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (rows.isLoading || profiles.isLoading) return <Spinner />;
  if (rows.error) return <ErrorBox error={rows.error} />;
  const list = rows.data ?? [];
  const hasHours = (machines.data ?? []).some((m) => m.meterKind === "hours");
  const newBtn = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      {t("ui.labor.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {list.length > 0 && <HeaderActions>{newBtn}</HeaderActions>}
      {list.length === 0 ? (
        <EmptyState title={t("ui.labor.emptyTitle")} action={hasHours ? newBtn : <SectionButton to="machines" primary>{t("ui.labor.goMachines")}</SectionButton>}>
          {hasHours ? t("ui.labor.emptyHint") : t("ui.labor.emptyNoMachines")}
        </EmptyState>
      ) : (
        <>
          <ExportableTable name="mano-de-obra">
            <DataTable columns={laborColumns((r) => setEditing(profiles.data?.find((p) => p.machineId === r.machineId) ?? null), remove.mutate)} rows={list} rowKey={(r) => r.machineId} caption={t("ui.admin.section_labor")} />
          </ExportableTable>
          <p className="text-meta text-tinta-2">{t("ui.labor.note")}</p>
        </>
      )}
      {editing && <ProfileModal row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
