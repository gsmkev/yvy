import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_TYPES, PRODUCT_UNITS } from "@yvy/shared";
import { del, get, patch, post, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import type { Plot, Product } from "../lib/types";
import { PrescriptionModal } from "./PrescriptionModal";
import { Button, ConfirmModal, Empty, ErrorBox, Field, FormActions, Input, Modal, Select, Spinner, toast } from "./ui";
import { HeaderActions, RowMenu } from "./erp/adminSlot";

interface DoseRange {
  productId: string;
  min: number | null;
  max: number | null;
}
const useDoseRanges = (enabled = true) =>
  useQuery({ enabled, queryKey: ["dose-ranges"], queryFn: () => get<DoseRange[]>("/org/products/dose-ranges") });

export const useProducts = (enabled = true) =>
  useQuery({ enabled, queryKey: ["products"], queryFn: () => get<Product[]>("/org/products") });

/** Catálogo de productos de la organización (A-10): lo usa el celular para cargar aplicaciones. */
export function ProductsPanel({ canEdit, farmId, plots }: { canEdit: boolean; farmId?: string; plots?: Plot[] }) {
  const q = useProducts();
  const ranges = useDoseRanges();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [prescribing, setPrescribing] = useState(false);
  const [type, setType] = useState("");
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (p: Product) => del(`/org/products/${p.id}`),
    onSuccess: () => {
      toast(t("ui.toastProductDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
  if (q.isLoading) return <Spinner rows={5} h={56} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const list = (q.data ?? []).filter((p) => !type || p.type === type);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <HeaderActions>
            <Button variant="primary" onClick={() => setEditing("new")}>
              {t("ui.productNew")}
            </Button>
            {farmId && plots && <Button onClick={() => setPrescribing(true)}>{t("ui.prescriptionNew")}</Button>}
          </HeaderActions>
        )}
        <Select
          aria-label={t("ui.productType")}
          className="ml-auto"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: "", label: t("ui.productsAllTypes") },
            ...PRODUCT_TYPES.map((x) => ({ value: x, label: tk(`fields.productType_${x}`) })),
          ]}
        />
      </div>
      {list.length === 0 ? (
        <Empty title={t("ui.productsTitle")}>{t("ui.productNone")}</Empty>
      ) : (
        <ul className="divide-y divide-linea border-y border-linea">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{p.name}</span>
                <span className="mt-0.5 block text-tinta-2">
                  {[
                    tk(`fields.productType_${p.type}`),
                    tk(`fields.productUnit_${p.unit}`),
                    p.activeIngredient,
                    p.withdrawalDays !== null ? `${t("ui.productWithdrawal")}: ${p.withdrawalDays}` : null,
                    doseShown(p, ranges.data),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {canEdit && (
                <RowMenu name={p.name} onEdit={() => setEditing(p)} onDelete={() => setRemoving(p)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {prescribing && farmId && plots && <PrescriptionModal farmId={farmId} plots={plots} onClose={() => setPrescribing(false)} />}
      {editing && <ProductModal product={editing === "new" ? null : editing} range={ranges.data?.find((r) => r.productId === (editing === "new" ? "" : editing.id))} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={removing.name}
          message={t("ui.productConfirmDelete", { name: removing.name })}
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

/** "Dosis habitual: 1 a 3 l/ha", o null si el producto no tiene rango. */
function doseShown(p: Product, ranges: DoseRange[] | undefined): string | null {
  const r = ranges?.find((x) => x.productId === p.id);
  if (!r || (r.min === null && r.max === null)) return null;
  const n = (v: number) => v.toLocaleString("es-PY", { maximumFractionDigits: 2 });
  const range = r.min !== null && r.max !== null ? `${n(r.min)} a ${n(r.max)}` : r.min !== null ? `${t("ui.reviewAtLeast")} ${n(r.min)}` : `${t("ui.reviewUpTo")} ${n(r.max!)}`;
  return t("ui.productDoseShown", { range, unit: p.unit === "l" ? "l/ha" : "kg/ha" });
}

function ProductModal({ product, range, onClose }: { product: Product | null; range?: DoseRange; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: product?.name ?? "",
    type: product?.type ?? "agrochemical",
    unit: product?.unit ?? "l",
    activeIngredient: product?.activeIngredient ?? "",
    withdrawalDays: product?.withdrawalDays?.toString() ?? "",
    toxClass: product?.toxClass ?? "",
    doseMin: range?.min?.toString() ?? "",
    doseMax: range?.max?.toString() ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name,
        type: f.type,
        unit: f.unit,
        activeIngredient: f.activeIngredient.trim() || null,
        withdrawalDays: f.withdrawalDays === "" ? null : Number(f.withdrawalDays),
        toxClass: f.toxClass.trim() || null,
      };
      const saved = product ? patch(`/org/products/${product.id}`, body).then(() => product.id) : post<{ id: string }>("/org/products", body).then((r) => r.id);
      // X-26: la dosis habitual va aparte del producto (no se sincroniza al celular)
      return saved.then((id) =>
        put(`/org/products/${id}/dose-range`, {
          min: f.doseMin === "" ? null : Number(f.doseMin),
          max: f.doseMax === "" ? null : Number(f.doseMax),
        }),
      );
    },
    onSuccess: () => {
      toast(t("ui.toastProductSaved"));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dose-ranges"] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={product ? product.name : t("ui.productNew")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.productName")}>
          <Input required autoFocus value={f.name} onChange={set("name")} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.productType")}>
            <Select
              value={f.type}
              onChange={set("type")}
              options={PRODUCT_TYPES.map((x) => ({ value: x, label: tk(`fields.productType_${x}`) }))}
            />
          </Field>
          <Field label={t("ui.productUnit")}>
            <Select
              value={f.unit}
              onChange={set("unit")}
              options={PRODUCT_UNITS.map((x) => ({ value: x, label: tk(`fields.productUnit_${x}`) }))}
            />
          </Field>
          <Field label={t("ui.productActiveIngredient")}>
            <Input value={f.activeIngredient} onChange={set("activeIngredient")} maxLength={120} />
          </Field>
          <Field label={t("ui.productWithdrawal")}>
            <Input type="number" min={0} max={365} step={1} value={f.withdrawalDays} onChange={set("withdrawalDays")} />
          </Field>
          <Field label={t("ui.productToxClass")}>
            <Input value={f.toxClass} onChange={set("toxClass")} maxLength={40} />
          </Field>
        </div>
        <fieldset className="border-t border-linea pt-3">
          <legend className="text-sm font-medium">{t("ui.productDoseTitle")}</legend>
          <p className="mt-1 text-xs text-tinta-2">{t("ui.productDoseHint")}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label={t("ui.productDoseMin", { unit: f.unit === "l" ? "l/ha" : "kg/ha" })}>
              <Input type="number" min={0} step="any" value={f.doseMin} onChange={set("doseMin")} />
            </Field>
            <Field label={t("ui.productDoseMax", { unit: f.unit === "l" ? "l/ha" : "kg/ha" })}>
              <Input type="number" min={0} step="any" value={f.doseMax} onChange={set("doseMax")} />
            </Field>
          </div>
        </fieldset>
        {save.error && <ErrorBox error={save.error} />}
        <FormActions onCancel={onClose} disabled={save.isPending} />
      </form>
    </Modal>
  );
}
