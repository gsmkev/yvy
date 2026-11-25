/** Compras y ventas de hacienda: cabezas, kilos, precio y guía de traslado. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { Button, DataTable, EmptyState, ErrorBox, Spinner, toast } from "../ui";
import { useSeasonList } from "./costs/useCosts";
import { HeaderActions, useTableExport } from "./adminSlot";
import { RowModal } from "./RowModal";
import { useParties } from "./PartiesPanel";
import { dealColumns, dealFields, type Deal } from "./cattle/dealColumns";

/** Compras y ventas de hacienda con guía de traslado. */
export function CattlePanel() {
  const q = useQuery({ queryKey: ["erp", "cattle-deals"], queryFn: () => get<Deal[]>("/org/erp/cattle-deals") });
  const parties = useParties();
  const farms = useFarms();
  const seasons = useSeasonList();
  const [creating, setCreating] = useState(false);
  const exp = useTableExport("ganado");
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/cattle-deals/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const fields = dealFields(
    (parties.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    (farms.data ?? []).map((f) => ({ value: f.id, label: f.name })),
    (seasons.data ?? []).map((x) => ({ value: x.id, label: x.name })),
  );
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name ?? "";
  const rows = q.data ?? [];
  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {t("ui.cattle.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <>
          <HeaderActions>{newButton}</HeaderActions>
          {exp.menu}
        </>
      )}
      {rows.length === 0 ? (
        <EmptyState title={t("ui.empty.cattleTitle")} action={newButton}>
          {t("ui.empty.cattleBody")}
        </EmptyState>
      ) : (
        <div ref={exp.ref}>
          <DataTable columns={dealColumns(party, rows.some((d) => d.guideNumber), remove.mutate)} rows={rows} rowKey={(d) => d.id} caption={t("ui.admin.section_cattle")} />
        </div>
      )}
      {remove.error ? <ErrorBox error={remove.error} /> : null}
      {creating && <RowModal title={t("ui.cattle.new")} fields={fields} row={null} path="cattle-deals" onClose={() => setCreating(false)} />}
    </div>
  );
}
