/** Estado y guardado del alta, edición y borrado de productos por REST. */
import { useState } from "react";
import { t } from "@yvy/shared";
import type { Product } from "../../db/store";
import { syncNow } from "../../lib/sync";
import { showToast } from "../../lib/toast";
import { useOnlineMutation } from "../useOnlineMutation";
import { draftOf, parseDraft, type Draft, type DoseRange } from "./draft";

/** Edición de productos: borrador abierto, borrado pendiente y las mutaciones con sus errores. */
export function useProductEditor(rangeOf: Map<string, DoseRange>, onSaved: () => void) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/products");
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/products/${b.id}`);
  const dose = useOnlineMutation<{ id: string; min: number | null; max: number | null }, { ok: boolean }>("PUT", (b) => `/org/products/${b.id}/dose-range`, { invalidate: ["/org/products"] });
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/products/${b.id}`);

  const open = (p: Product | null) => {
    create.reset();
    edit.reset();
    dose.reset();
    setFormError(null);
    setDraft(draftOf(p, p ? rangeOf.get(p.id) : undefined));
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const saveProduct = async (d: Draft, body: Record<string, unknown>) => {
    if (d.id) return edit.mutate({ id: d.id, ...body }).then((r) => (r.ok ? { ok: true as const, id: d.id! } : r));
    return create.mutate(body).then((r) => (r.ok ? { ok: true as const, id: r.data.id } : r));
  };

  const submit = async () => {
    if (!draft) return;
    const parsed = parseDraft(draft);
    if ("error" in parsed) return setFormError(parsed.error);
    setFormError(null);
    const saved = await saveProduct(draft, parsed.body);
    if (!saved.ok) return;
    // La dosis habitual va aparte del producto (como en la web); si falla, el producto ya quedó guardado.
    const hadRange = draft.id ? rangeOf.has(draft.id) : false;
    if (parsed.min !== null || parsed.max !== null || hadRange) {
      const d = await dose.mutate({ id: saved.id, min: parsed.min, max: parsed.max });
      if (!d.ok) return;
    }
    setDraft(null);
    showToast(t("ui.toast.productSaved"));
    onSaved();
    void syncNow();
  };

  const askRemove = (p: Product | null) => {
    remove.reset();
    setRemoving(p);
    setDraft(null);
  };
  const confirmRemove = async (p: Product) => {
    const r = await remove.mutate({ id: p.id });
    if (!r.ok) return;
    setRemoving(null);
    showToast(t("ui.toast.productDeleted"));
    void syncNow();
  };

  return {
    draft,
    set,
    open,
    close: () => setDraft(null),
    submit,
    removing,
    askRemove,
    confirmRemove,
    cancelRemove: () => setRemoving(null),
    removeState: remove,
    pending: create.pending || edit.pending || dose.pending,
    error: formError ?? edit.error ?? create.error ?? dose.error,
  };
}
