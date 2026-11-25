/** Diálogo de alta y edición de un producto, con su dosis habitual. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_TYPES, PRODUCT_UNITS } from "@yvy/shared";
import { patch, post, put } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import type { DoseRange } from "../../lib/products";
import type { Product } from "../../lib/types";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../ui";

type ProductForm = {
  name: string;
  type: string;
  unit: string;
  activeIngredient: string;
  withdrawalDays: string;
  toxClass: string;
  doseMin: string;
  doseMax: string;
};

const optNum = (v: string) => (v === "" ? null : Number(v));

function initialForm(product: Product | null, range?: DoseRange): ProductForm {
  return {
    name: product?.name ?? "",
    type: product?.type ?? "agrochemical",
    unit: product?.unit ?? "l",
    activeIngredient: product?.activeIngredient ?? "",
    withdrawalDays: product?.withdrawalDays?.toString() ?? "",
    toxClass: product?.toxClass ?? "",
    doseMin: range?.min?.toString() ?? "",
    doseMax: range?.max?.toString() ?? "",
  };
}

/** Guarda el producto y, aparte, su dosis habitual (no se sincroniza al celular). */
function useSaveProduct(product: Product | null, f: ProductForm, onClose: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const body = {
        name: f.name,
        type: f.type,
        unit: f.unit,
        activeIngredient: f.activeIngredient.trim() || null,
        withdrawalDays: optNum(f.withdrawalDays),
        toxClass: f.toxClass.trim() || null,
      };
      const id = product
        ? await patch(`/org/products/${product.id}`, body).then(() => product.id)
        : await post<{ id: string }>("/org/products", body).then((r) => r.id);
      return put(`/org/products/${id}/dose-range`, { min: optNum(f.doseMin), max: optNum(f.doseMax) });
    },
    onSuccess: () => {
      toast(t("ui.toast.productSaved"));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dose-ranges"] });
      onClose();
    },
  });
}

/** Props de ProductModal: `product` es null para uno nuevo y `range` es su dosis habitual. */
interface ProductModalProps {
  product: Product | null;
  range?: DoseRange;
  onClose: () => void;
}

/** Alta y edición de un producto del catálogo. */
export function ProductModal({ product, range, onClose }: ProductModalProps) {
  const [f, setF] = useState(() => initialForm(product, range));
  const save = useSaveProduct(product, f, onClose);
  const set = (k: keyof ProductForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const doseUnit = f.unit === "l" ? "l/ha" : "kg/ha";
  return (
    <Modal title={product ? product.name : t("ui.product.new")} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        <Field label={t("ui.product.name")} wide>
          <Input required autoFocus value={f.name} onChange={set("name")} maxLength={120} />
        </Field>
        <Field label={t("ui.product.type")}>
          <Select value={f.type} onChange={set("type")} options={PRODUCT_TYPES.map((x) => ({ value: x, label: tk(`fields.product.type_${x}`) }))} />
        </Field>
        <Field label={t("ui.product.unit")}>
          <Select value={f.unit} onChange={set("unit")} options={PRODUCT_UNITS.map((x) => ({ value: x, label: tk(`fields.product.unit_${x}`) }))} />
        </Field>
        <Field label={t("ui.product.activeIngredient")}>
          <Input value={f.activeIngredient} onChange={set("activeIngredient")} maxLength={120} />
        </Field>
        <Field label={t("ui.product.withdrawal")}>
          <Input type="number" min={0} max={365} step={1} value={f.withdrawalDays} onChange={set("withdrawalDays")} />
        </Field>
        <Field label={t("ui.product.toxClass")}>
          <Input value={f.toxClass} onChange={set("toxClass")} maxLength={40} />
        </Field>
        <fieldset className="border-t border-linea pt-3 sm:col-span-2">
          <legend className="text-sm font-medium">{t("ui.product.doseTitle")}</legend>
          <p className="mt-1 text-xs text-tinta-2">{t("ui.product.doseHint")}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label={t("ui.product.doseMin", { unit: doseUnit })}>
              <Input type="number" min={0} step="any" value={f.doseMin} onChange={set("doseMin")} />
            </Field>
            <Field label={t("ui.product.doseMax", { unit: doseUnit })}>
              <Input type="number" min={0} step="any" value={f.doseMax} onChange={set("doseMax")} />
            </Field>
          </div>
        </fieldset>
        <FormFooter error={save.error} disabled={save.isPending} label={t("ui.common.save")} />
      </Form>
    </Modal>
  );
}
