/** Diálogo para fijar el stock mínimo de un producto en un depósito. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { put } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { useProducts } from "../../../lib/products";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../../ui";
import { useWarehouses } from "../WarehousesPanel";
import type { Minimum } from "./useMinStock";

/** Alta o cambio de un mínimo; `row` es null para uno nuevo. */
export function MinModal({ row, onClose }: { row: Minimum | null; onClose: () => void }) {
  const products = useProducts();
  const warehouses = useWarehouses();
  const qc = useQueryClient();
  const [productId, setProductId] = useState(row?.productId ?? products.data?.[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(row?.warehouseId ?? warehouses.data?.[0]?.id ?? "");
  const [minQty, setMinQty] = useState(row ? String(row.minQty) : "");
  const save = useMutation({
    mutationFn: () => put("/org/erp/stock/minimums", { productId, warehouseId, minQty: Number(minQty) }),
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={t("ui.min.stockNew")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.stock.product")} wide>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label={t("ui.stock.where")}>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label={t("ui.min.stockMin")}>
          <Input required type="number" min={0} step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        </Field>
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
