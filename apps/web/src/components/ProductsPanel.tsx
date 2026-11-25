/** Catálogo de productos de la organización (Administración y ficha de la estancia). */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_TYPES } from "@yvy/shared";
import { del } from "../lib/api";
import { t, tk } from "../lib/i18n";
import type { Plot, Product } from "../lib/types";
import { useDoseRanges, useProducts, type DoseRange } from "../lib/products";
import { PrescriptionModal } from "./PrescriptionModal";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Field, FilterBar, Select, Spinner, toast } from "./ui";
import { HeaderActions, useTableExport } from "./erp/adminSlot";
import { ProductModal } from "./products/ProductModal";
import { productColumns } from "./products/productColumns";

function useRemoveProduct(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Product) => del(`/org/products/${p.id}`),
    onSuccess: () => {
      toast(t("ui.toast.productDeleted"));
      onDone();
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

function TypeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <FilterBar sheet={false}>
      <Field label={t("ui.product.type")}>
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          options={[{ value: "", label: t("ui.products.allTypes") }, ...PRODUCT_TYPES.map((x) => ({ value: x, label: tk(`fields.product.type_${x}`) }))]}
        />
      </Field>
    </FilterBar>
  );
}

/** Estado de los diálogos del catálogo; cada `on*` cierra o abre el suyo. */
interface ProductDialogsProps {
  editing: Product | "new" | null;
  removing: Product | null;
  prescribing: boolean;
  ranges: DoseRange[] | undefined;
  farmId?: string;
  plots?: Plot[];
  remove: ReturnType<typeof useRemoveProduct>;
  onEdit: (p: Product | "new" | null) => void;
  onRemove: (p: Product | null) => void;
  onPrescribe: (open: boolean) => void;
}

/** Diálogos del catálogo: receta por zonas, alta o edición y confirmación de baja. */
function ProductDialogs({ editing, removing, prescribing, ranges, farmId, plots, remove, onEdit, onRemove, onPrescribe }: ProductDialogsProps) {
  const editedId = editing && editing !== "new" ? editing.id : "";
  return (
    <>
      {prescribing && farmId && plots && <PrescriptionModal farmId={farmId} plots={plots} onClose={() => onPrescribe(false)} />}
      {editing && <ProductModal product={editing === "new" ? null : editing} range={ranges?.find((r) => r.productId === editedId)} onClose={() => onEdit(null)} />}
      {removing && (
        <ConfirmModal
          title={removing.name}
          message={t("ui.product.confirmDelete", { name: removing.name })}
          confirmLabel={t("ui.common.delete")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => onRemove(null)}
        />
      )}
    </>
  );
}

/** Props de ProductsPanel: con `farmId` y `plots` se muestra dentro de la estancia y ofrece la receta por zonas. */
interface ProductsPanelProps {
  canEdit: boolean;
  farmId?: string;
  plots?: Plot[];
}

/** Catálogo de productos de la organización: lo usa el celular para cargar aplicaciones. */
export function ProductsPanel({ canEdit, farmId, plots }: ProductsPanelProps) {
  const q = useProducts();
  const ranges = useDoseRanges();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [prescribing, setPrescribing] = useState(false);
  const [type, setType] = useState("");
  const exp = useTableExport("productos");
  const remove = useRemoveProduct(() => setRemoving(null));
  if (q.isLoading) return <Spinner rows={5} h={56} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data ?? [];
  const list = all.filter((p) => !type || p.type === type);
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
          <TypeFilter value={type} onChange={setType} />
        </>
      )}
      <div ref={exp.ref}>
        <DataTable
          columns={productColumns({ compact: !!farmId, products: all, ranges: ranges.data, canEdit, onEdit: setEditing, onDelete: setRemoving })}
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
      <ProductDialogs
        editing={editing}
        removing={removing}
        prescribing={prescribing}
        ranges={ranges.data}
        farmId={farmId}
        plots={plots}
        remove={remove}
        onEdit={setEditing}
        onRemove={setRemoving}
        onPrescribe={setPrescribing}
      />
    </div>
  );
}
