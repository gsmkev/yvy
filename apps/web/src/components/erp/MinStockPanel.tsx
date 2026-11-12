/** Stock mínimo por producto y depósito, con la lista de lo que hay que reponer (E-14). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, put } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { fmtQty } from "../../lib/money";
import { useProducts } from "../ProductsPanel";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../ui";
import { useWarehouses } from "./WarehousesPanel";

interface Minimum {
  id: string;
  productId: string;
  warehouseId: string;
  minQty: number;
}
interface Low {
  productId: string;
  warehouseId: string;
  qty: number;
  minQty: number;
  missing: number;
}

export function MinStockPanel() {
  const products = useProducts();
  const warehouses = useWarehouses();
  const mins = useQuery({ queryKey: ["erp", "stock-minimums"], queryFn: () => get<Minimum[]>("/org/erp/stock/minimums") });
  const low = useQuery({ queryKey: ["erp", "stock-low"], queryFn: () => get<Low[]>("/org/erp/stock/low") });
  const [editing, setEditing] = useState<Minimum | "new" | null>(null);
  const [removing, setRemoving] = useState<Minimum | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (m: Minimum) => del(`/org/erp/stock/minimums/${m.id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (mins.isLoading || products.isLoading || warehouses.isLoading) return <Spinner />;
  if (mins.error) return <ErrorBox error={mins.error} />;
  const prod = (id: string) => products.data?.find((p) => p.id === id);
  const wh = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? "";
  const unit = (id: string) => tk(`fields.productUnit_${prod(id)?.unit ?? "l"}`);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-tinta-2">{t("ui.minStockIntro")}</p>
      <div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("ui.minStockNew")}
        </Button>
      </div>
      {low.data && low.data.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="border-b border-linea pb-2 font-serif text-lg font-semibold">{t("ui.minStockLowTitle")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {low.data.map((l) => (
                <tr key={`${l.productId}-${l.warehouseId}`} className="border-b border-linea">
                  <td className="py-2.5 pr-4 font-medium">{prod(l.productId)?.name}</td>
                  <td className="py-2.5 pr-4 text-tinta-2">{wh(l.warehouseId)}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtQty(l.qty, unit(l.productId))}</td>
                  <td className="py-2.5 text-right text-trigo-texto">{t("ui.minStockMissing", { qty: fmtQty(l.missing, unit(l.productId)) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(mins.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-tinta-2">
                <th className="py-2 pr-4 font-medium">{t("ui.stockProduct")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.stockWhere")}</th>
                <th className="py-2 pr-4 text-right font-medium">{t("ui.minStockMin")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(mins.data ?? []).map((m) => (
                <tr key={m.id} className="border-b border-linea">
                  <td className="py-2.5 pr-4 font-medium">{prod(m.productId)?.name}</td>
                  <td className="py-2.5 pr-4">{wh(m.warehouseId)}</td>
                  <td className="num py-2.5 pr-4 text-right">{fmtQty(m.minQty, unit(m.productId))}</td>
                  <td className="py-2.5 text-right whitespace-nowrap text-tinta-2">
                    <button className="mr-4 cursor-pointer underline-offset-4 hover:text-surco hover:underline" onClick={() => setEditing(m)}>
                      {t("ui.erpEdit")}
                    </button>
                    <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setRemoving(m)}>
                      {t("ui.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <MinModal row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={prod(removing.productId)?.name ?? ""}
          message={t("ui.erpDeleteConfirm", { name: prod(removing.productId)?.name ?? "" })}
          confirmLabel={t("ui.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function MinModal({ row, onClose }: { row: Minimum | null; onClose: () => void }) {
  const products = useProducts();
  const warehouses = useWarehouses();
  const qc = useQueryClient();
  const [productId, setProductId] = useState(row?.productId ?? products.data?.[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(row?.warehouseId ?? warehouses.data?.[0]?.id ?? "");
  const [minQty, setMinQty] = useState(row ? String(row.minQty) : "");
  const save = useMutation({
    mutationFn: () => put("/org/erp/stock/minimums", { productId, warehouseId, minQty: Number(minQty) }),
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.minStockNew")} onClose={onClose}>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="col-span-2">
          <Field label={t("ui.stockProduct")}>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </div>
        <Field label={t("ui.stockWhere")}>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label={t("ui.minStockMin")}>
          <Input required type="number" min={0} step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        </Field>
        {save.error ? (
          <div className="col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
        <div className="col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
