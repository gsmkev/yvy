/** Estado y guardado de los mínimos de stock por REST (cargar, cambiar y quitar). */
import { useState } from "react";
import { t } from "@yvy/shared";
import { showToast } from "../../lib/toast";
import { parseDecimal } from "../format";
import { useOnlineMutation } from "../useOnlineMutation";

/** Mínimo cargado para un producto en un depósito. */
export interface Minimum {
  id: string;
  productId: string;
  warehouseId: string;
  minQty: number;
}

/** Campos del formulario de mínimo como texto. */
export interface Draft {
  id: string | null;
  productId: string;
  warehouseId: string;
  minQty: string;
}

/** Texto del error de los campos del borrador, o null si se puede guardar. */
function draftError(d: Draft, qty: number | null): string | null {
  if (!d.productId) return t("office.adm.needsProduct");
  if (!d.warehouseId) return t("ui.stock.noWarehouse");
  if (qty === null || qty < 0) return t("office.adm.badQty");
  return null;
}

/** Edición de mínimos: borrador abierto, guardado, borrado y errores. `defaultWarehouse` se propone al crear. */
export function useMinEditor(manage: boolean, defaultWarehouse: string) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<{ productId: string; warehouseId: string; minQty: number }, { ok: boolean }>("PUT", "/org/erp/stock/minimums", { invalidate: ["/org/erp"] });
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/erp/stock/minimums/${b.id}`, { invalidate: ["/org/erp"] });

  const open = (m: Minimum | null) => {
    if (!manage) return;
    setFormError(null);
    save.reset();
    remove.reset();
    setDraft(m ? { id: m.id, productId: m.productId, warehouseId: m.warehouseId, minQty: String(m.minQty).replace(".", ",") } : { id: null, productId: "", warehouseId: defaultWarehouse, minQty: "" });
  };
  const submit = async () => {
    if (!draft) return;
    const n = parseDecimal(draft.minQty);
    const bad = draftError(draft, n);
    if (bad) return setFormError(bad);
    setFormError(null);
    const r = await save.mutate({ productId: draft.productId, warehouseId: draft.warehouseId, minQty: n! });
    if (!r.ok) return;
    setDraft(null);
    showToast(t("ui.erp.saved"));
  };
  const doRemove = async () => {
    if (!draft?.id) return;
    const r = await remove.mutate({ id: draft.id });
    if (!r.ok) return;
    setDraft(null);
    showToast(t("ui.erp.deleted"));
  };

  return {
    draft,
    open,
    submit,
    doRemove,
    close: () => setDraft(null),
    set: (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)),
    pending: save.pending,
    removing: remove.pending,
    error: formError ?? save.error ?? remove.error,
  };
}

/** Editor de mínimos de stock. */
export type MinEditor = ReturnType<typeof useMinEditor>;
