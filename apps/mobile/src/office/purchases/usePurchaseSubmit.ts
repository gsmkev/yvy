/** Guardado de la compra nueva: la compra, y después la factura, la recepción y la foto según lo cargado. */
import { useState } from "react";
import { router } from "expo-router";
import { t, type Currency } from "@yvy/shared";
import { showToast } from "../../lib/toast";
import { invalidate } from "../cache";
import { uploadInvoicePhoto } from "../invoiceUpload";
import type { PickedPhoto } from "../invoicePhoto";
import { useOnlineMutation } from "../useOnlineMutation";
import { linesBody, type LineDraft } from "./lines";

/** Datos de la compra tal como están en el formulario. */
interface PurchaseForm {
  partyId: string;
  date: string;
  currency: Currency;
  lines: LineDraft[];
  invoiceNumber: string;
  photo: PickedPhoto | null;
}

/** Guarda la compra por pasos; devuelve `submit`, `pending` y el último error. */
export function usePurchaseSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/purchases", { invalidate: ["/org/erp"] });
  const invoice = useOnlineMutation<{ id: string; invoiceNumber: string; invoiceDate: string }, unknown>("POST", (b) => `/org/erp/purchases/${b.id}/invoice`);
  const receive = useOnlineMutation<{ id: string; warehouseId: string; date: string }, unknown>("POST", (b) => `/org/erp/purchases/${b.id}/receive`);

  /** Pasos posteriores a crear la compra; devuelve los errores de lo que no se pudo completar. */
  const finish = async (id: string, f: PurchaseForm, whId: string): Promise<string[]> => {
    const later: string[] = [];
    if (f.invoiceNumber.trim()) {
      const i = await invoice.mutate({ id, invoiceNumber: f.invoiceNumber.trim(), invoiceDate: f.date });
      if (!i.ok) later.push(i.error);
    }
    if (whId) {
      const rc = await receive.mutate({ id, warehouseId: whId, date: f.date });
      if (!rc.ok) later.push(rc.error);
    }
    if (f.photo) {
      try {
        await uploadInvoicePhoto("purchases", id, f.photo);
      } catch (e) {
        later.push(e instanceof Error ? e.message : t("ui.photo.uploadFailed"));
      }
    }
    return later;
  };

  /** `whId` es el depósito efectivo ("" si se recibe más tarde). */
  const submit = async (f: PurchaseForm, whId: string) => {
    if (saving) return;
    const lines = linesBody(f.lines, f.currency);
    if ("error" in lines) return setError(lines.error);
    if (!f.date) return setError(t("office.adm.needsDate"));
    setError(null);
    setSaving(true);
    try {
      const r = await create.mutate({ partyId: f.partyId || null, orderDate: f.date, currency: f.currency, lines });
      if (!r.ok) return setError(r.error);
      const later = await finish(r.data.id, f, whId);
      invalidate(["/org/erp"]);
      if (later.length) {
        // La compra ya está guardada: se avisa lo que faltó y se sigue en su detalle para completarlo.
        showToast(t("office.adm.savedPartial"));
        router.replace({ pathname: "/office/admin/purchase", params: { id: r.data.id } });
        return;
      }
      showToast(t("ui.erp.saved"));
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return { submit, error, pending: saving || create.pending };
}
