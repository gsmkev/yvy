import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_TYPES, PRODUCT_UNITS } from "@yvy/shared";
import { del, get, patch, post } from "../lib/api";
import { t, tk } from "../lib/i18n";
import type { Product } from "../lib/types";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "./ui";

export const useProducts = (enabled = true) =>
  useQuery({ enabled, queryKey: ["products"], queryFn: () => get<Product[]>("/org/products") });

/** Catálogo de productos de la organización (A-10): lo usa el celular para cargar aplicaciones. */
export function ProductsPanel({ canEdit }: { canEdit: boolean }) {
  const q = useProducts();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (p: Product) => del(`/org/products/${p.id}`),
    onSuccess: () => {
      toast(t("ui.toastProductDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const list = q.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.productsIntro")}</p>
      {canEdit && (
        <div>
          <Button variant="primary" onClick={() => setEditing("new")}>
            {t("ui.productNew")}
          </Button>
        </div>
      )}
      {list.length === 0 ? (
        <Empty title={t("ui.productsTitle")}>{t("ui.productNone")}</Empty>
      ) : (
        <ul className="divide-y divide-linea border-y border-linea">
          {list.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{p.name}</span>
                <span className="mt-0.5 block text-tinta-2">
                  {[
                    tk(`fields.productType_${p.type}`),
                    tk(`fields.productUnit_${p.unit}`),
                    p.activeIngredient,
                    p.withdrawalDays !== null ? `${t("ui.productWithdrawal")}: ${p.withdrawalDays}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {canEdit && (
                <span className="flex shrink-0 gap-4 text-tinta-2">
                  <button className="cursor-pointer underline-offset-4 hover:text-surco hover:underline" onClick={() => setEditing(p)}>
                    {t("ui.productEdit")}
                  </button>
                  <button className="cursor-pointer underline-offset-4 hover:text-peligro hover:underline" onClick={() => setRemoving(p)}>
                    {t("ui.delete")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
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

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: product?.name ?? "",
    type: product?.type ?? "agrochemical",
    unit: product?.unit ?? "l",
    activeIngredient: product?.activeIngredient ?? "",
    withdrawalDays: product?.withdrawalDays?.toString() ?? "",
    toxClass: product?.toxClass ?? "",
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
      return product ? patch(`/org/products/${product.id}`, body) : post("/org/products", body);
    },
    onSuccess: () => {
      toast(t("ui.toastProductSaved"));
      qc.invalidateQueries({ queryKey: ["products"] });
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
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}
