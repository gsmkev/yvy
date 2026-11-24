import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_TYPES, PRODUCT_UNITS } from "@yvy/shared";
import { del, get, patch, post, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import type { Plot, Product } from "../lib/types";
import { useProducts } from "../lib/products";
import { PrescriptionModal } from "./PrescriptionModal";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, FilterBar, Form, Input, Modal, Select, Spinner, toast } from "./ui";
import { HeaderActions, RowMenu, useTableExport } from "./erp/adminSlot";

interface DoseRange {
  productId: string;
  min: number | null;
  max: number | null;
}
const useDoseRanges = (enabled = true) =>
  useQuery({ enabled, queryKey: ["dose-ranges"], queryFn: () => get<DoseRange[]>("/org/products/dose-ranges") });

/** Catálogo de productos de la organización (A-10): lo usa el celular para cargar aplicaciones. */
export function ProductsPanel({ canEdit, farmId, plots }: { canEdit: boolean; farmId?: string; plots?: Plot[] }) {
  const q = useProducts();
  const ranges = useDoseRanges();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [prescribing, setPrescribing] = useState(false);
  const [type, setType] = useState("");
  const exp = useTableExport("productos");
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (p: Product) => del(`/org/products/${p.id}`),
    onSuccess: () => {
      toast(t("ui.toast.productDeleted"));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
  if (q.isLoading) return <Spinner rows={5} h={56} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data ?? [];
  const list = all.filter((p) => !type || p.type === type);
  // Ficha de la estancia: el panel es angosto, así que tipo, unidad y principio activo van bajo el nombre
  const compact = !!farmId;
  const columns: Column<Product>[] = [
    { id: "name", header: t("ui.product.name"), cell: (p) => (<>{p.name}<span className={`block text-xs font-normal text-tinta-2 ${compact ? "" : "sm:hidden"}`}>{tk(`fields.product.type_${p.type}`)} · {tk(`fields.product.unit_${p.unit}`)}{compact && p.activeIngredient ? ` · ${p.activeIngredient}` : ""}</span></>), sort: (a, b) => a.name.localeCompare(b.name) },
    ...(compact ? [] : [
      { id: "type", header: t("ui.product.type"), hideBelow: "sm", cell: (p: Product) => tk(`fields.product.type_${p.type}`) } satisfies Column<Product>,
      { id: "unit", header: t("ui.product.unit"), hideBelow: "sm", cell: (p: Product) => tk(`fields.product.unit_${p.unit}`) } satisfies Column<Product>,
    ]),
    ...(!compact && all.some((p) => p.activeIngredient) ? [{ id: "ai", header: t("ui.product.activeIngredient"), hideBelow: "md", cell: (p: Product) => <span className="text-tinta-2">{p.activeIngredient ?? ""}</span> } satisfies Column<Product>] : []),
    ...(all.some((p) => p.withdrawalDays !== null) ? [{ id: "wd", header: t("ui.product.withdrawal"), align: "right", hideBelow: compact ? undefined : "lg", cell: (p: Product) => (p.withdrawalDays === null ? "" : p.withdrawalDays) } satisfies Column<Product>] : []),
    ...((ranges.data ?? []).some((r) => r.min !== null || r.max !== null)
      ? [{ id: "dose", header: t("ui.product.doseCol"), hideBelow: "lg", cell: (p: Product) => <span className="text-tinta-2">{doseShown(p, ranges.data) ?? ""}</span> } satisfies Column<Product>]
      : []),
    ...(canEdit
      ? [{ id: "menu", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (p: Product) => <RowMenu name={p.name} onEdit={() => setEditing(p)} onDelete={() => setRemoving(p)} /> } satisfies Column<Product>]
      : []),
  ];
  const newButton = (
    <Button variant={farmId ? "secondary" : "primary"} onClick={() => setEditing("new")}>
      {t("ui.product.new")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      {canEdit && all.length > 0 && (
        <HeaderActions>
          {newButton}
          {farmId && plots && <Button onClick={() => setPrescribing(true)}>{t("ui.prescription.new")}</Button>}
        </HeaderActions>
      )}
      {all.length > 0 && (
        <>
          {list.length > 0 && exp.menu}
          <FilterBar>
            <Select
              aria-label={t("ui.product.type")}
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={[{ value: "", label: t("ui.products.allTypes") }, ...PRODUCT_TYPES.map((x) => ({ value: x, label: tk(`fields.product.type_${x}`) }))]}
            />
          </FilterBar>
        </>
      )}
      <div ref={exp.ref}>
        <DataTable
          columns={columns}
          rows={list}
          rowKey={(p) => p.id}
          caption={t("ui.products.title")}
          empty={
            all.length === 0 ? (
              <EmptyState title={t("ui.empty.productsTitle")} action={canEdit ? newButton : undefined}>
                {t("ui.empty.productsBody")}
              </EmptyState>
            ) : (
              <EmptyState compact title={t("ui.erp.empty")} />
            )
          }
        />
      </div>
      {prescribing && farmId && plots && <PrescriptionModal farmId={farmId} plots={plots} onClose={() => setPrescribing(false)} />}
      {editing && <ProductModal product={editing === "new" ? null : editing} range={ranges.data?.find((r) => r.productId === (editing === "new" ? "" : editing.id))} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={removing.name}
          message={t("ui.product.confirmDelete", { name: removing.name })}
          confirmLabel={t("ui.common.delete")}
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
  const range = r.min !== null && r.max !== null ? `${n(r.min)} a ${n(r.max)}` : r.min !== null ? `${t("ui.review.atLeast")} ${n(r.min)}` : `${t("ui.review.upTo")} ${n(r.max!)}`;
  return t("ui.product.doseShown", { range, unit: p.unit === "l" ? "l/ha" : "kg/ha" });
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
      toast(t("ui.toast.productSaved"));
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dose-ranges"] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={product ? product.name : t("ui.product.new")} onClose={onClose}>
      <Form className="flex flex-col gap-3" onSubmit={() => save.mutate()}>
        <Field label={t("ui.product.name")}>
          <Input required autoFocus value={f.name} onChange={set("name")} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.product.type")}>
            <Select
              value={f.type}
              onChange={set("type")}
              options={PRODUCT_TYPES.map((x) => ({ value: x, label: tk(`fields.product.type_${x}`) }))}
            />
          </Field>
          <Field label={t("ui.product.unit")}>
            <Select
              value={f.unit}
              onChange={set("unit")}
              options={PRODUCT_UNITS.map((x) => ({ value: x, label: tk(`fields.product.unit_${x}`) }))}
            />
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
        </div>
        <fieldset className="border-t border-linea pt-3">
          <legend className="text-sm font-medium">{t("ui.product.doseTitle")}</legend>
          <p className="mt-1 text-xs text-tinta-2">{t("ui.product.doseHint")}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label={t("ui.product.doseMin", { unit: f.unit === "l" ? "l/ha" : "kg/ha" })}>
              <Input type="number" min={0} step="any" value={f.doseMin} onChange={set("doseMin")} />
            </Field>
            <Field label={t("ui.product.doseMax", { unit: f.unit === "l" ? "l/ha" : "kg/ha" })}>
              <Input type="number" min={0} step="any" value={f.doseMax} onChange={set("doseMax")} />
            </Field>
          </div>
        </fieldset>
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.common.save")}
        </Button>
      </Form>
    </Modal>
  );
}
