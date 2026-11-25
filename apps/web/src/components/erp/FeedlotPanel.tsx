/** Feedlot: raciones, suministro por corral y conversión alimenticia. Solo dueño y administrador. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import { useProducts } from "../../lib/products";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Spinner, Tabs, toast } from "../ui";
import { HeaderActions, RowMenu } from "./adminSlot";
import { CorralReport } from "./feedlot/CorralReport";
import { FeedModal } from "./feedlot/FeedModal";
import { RationModal } from "./feedlot/RationModal";
import type { Ration } from "./feedlot/types";
import type { Product } from "../../lib/types";

const useRations = () => useQuery({ queryKey: ["erp", "feedlot", "rations"], queryFn: () => get<Ration[]>("/org/erp/feedlot/rations") });

interface RationsTabProps {
  list: Ration[];
  products: Product[];
  onNew: () => void;
  onEdit: (r: Ration) => void;
  onRemove: (r: Ration) => void;
}

/** Raciones cargadas, o el vacío con la acción de crear la primera. */
function RationsTab({ list, products, onNew, onEdit, onRemove }: RationsTabProps) {
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const composition = (r: Ration) => r.items.map((i) => `${name(i.productId)} ${fmtNum(i.pctDm)} %`).join(", ");
  const columns: Column<Ration>[] = [
    {
      id: "name",
      header: t("ui.feedlot.rationName"),
      cell: (r) => (
        <>
          {r.name}
          <span className="num block text-meta font-normal text-tinta-2 md:hidden">{composition(r)}</span>
        </>
      ),
    },
    { id: "items", header: t("ui.feedlot.composition"), hideBelow: "md", cell: (r) => <span className="num text-tinta-2">{composition(r)}</span> },
    { id: "_actions", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (r) => <RowMenu name={r.name} onEdit={() => onEdit(r)} onDelete={() => onRemove(r)} /> },
  ];
  if (list.length === 0) {
    return (
      <EmptyState title={t("ui.feedlot.noRationsTitle")} action={<Button variant="primary" onClick={onNew}>{t("ui.feedlot.rationNew")}</Button>}>
        {t("ui.feedlot.noRations")}
      </EmptyState>
    );
  }
  return (
    <>
      <div>
        <Button onClick={onNew}>{t("ui.feedlot.rationNew")}</Button>
      </div>
      <DataTable columns={columns} rows={list} rowKey={(r) => r.id} caption={t("ui.feedlot.rations")} />
    </>
  );
}

/** Raciones, suministro por corral y conversión alimenticia. */
export function FeedlotPanel() {
  const rations = useRations();
  const products = useProducts();
  const farms = useFarms();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Ration | "new" | null>(null);
  const [removing, setRemoving] = useState<Ration | null>(null);
  const [feeding, setFeeding] = useState(false);
  const remove = useMutation({
    mutationFn: (r: Ration) => del(`/org/erp/feedlot/rations/${r.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp", "feedlot"] });
    },
  });
  const [tab, setTab] = useState("rations");
  if (rations.isLoading || products.isLoading) return <Spinner />;
  if (rations.error) return <ErrorBox error={rations.error} />;
  const list = rations.data ?? [];
  const canFeed = list.length > 0 && !!farms.data?.length;
  return (
    <div className="flex flex-col gap-4">
      {canFeed && (
        <HeaderActions>
          <Button variant="primary" onClick={() => setFeeding(true)}>
            {t("ui.feedlot.feed")}
          </Button>
        </HeaderActions>
      )}
      <Tabs<string>
        tabs={[
          { id: "rations", label: t("ui.feedlot.rations"), count: list.length || undefined },
          { id: "report", label: t("ui.feedlot.reportTab") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "rations" && <RationsTab list={list} products={products.data ?? []} onNew={() => setEditing("new")} onEdit={setEditing} onRemove={setRemoving} />}
      {tab === "report" && <CorralReport canFeed={canFeed} hasRations={list.length > 0} onFeed={() => setFeeding(true)} onNewRation={() => setEditing("new")} />}
      {editing && <RationModal ration={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {feeding && <FeedModal rations={list} onClose={() => setFeeding(false)} />}
      {removing && (
        <ConfirmModal
          title={t("ui.feedlot.rationDelete")}
          message={removing.name}
          confirmLabel={t("ui.common.delete")}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
