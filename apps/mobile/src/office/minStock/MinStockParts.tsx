/** Piezas de Stock mínimo: pestañas de faltantes y mínimos, y el formulario del mínimo. */
import { useState } from "react";
import { View } from "react-native";
import { t } from "@yvy/shared";
import type { Product } from "../../db/store";
import { Button, EmptyState } from "../../ui/kit";
import { unitOf, type WarehouseRow } from "../adminKit";
import { Skeleton } from "../state";
import type { useOnline } from "../useOnline";
import { fmtQty } from "../money";
import { DataList, FormSheet, Segmented, SelectField, TextField } from "../ui";
import type { Minimum, MinEditor } from "./useMinEditor";

/** Producto bajo su mínimo en un depósito. */
export interface Low {
  productId: string;
  warehouseId: string;
  qty: number;
  minQty: number;
  missing: number;
}

/** Pestañas Faltantes y Todos, con la lista de la elegida. */
function MinTabs({ tab, onTab, lowRows, minRows, byId, whName, onOpen }: { tab: "low" | "all"; onTab: (t: "low" | "all") => void; lowRows: Low[]; minRows: Minimum[]; byId: Map<string, Product>; whName: (id: string) => string; onOpen?: (m: Minimum) => void }) {
  const name = (id: string) => byId.get(id)?.name ?? "—";
  return (
    <>
      <View style={{ marginTop: 16 }}>
        <Segmented<"low" | "all"> value={tab} onChange={onTab} options={[{ value: "low", label: `${t("ui.min.tabLow")}, ${lowRows.length}` }, { value: "all", label: `${t("ui.min.tabAll")}, ${minRows.length}` }]} />
      </View>
      {tab === "low" ? (
        <DataList
          rows={lowRows}
          keyOf={(l) => `${l.productId}-${l.warehouseId}`}
          title={(l) => name(l.productId)}
          subtitle={(l) => whName(l.warehouseId)}
          detail={(l) => {
            const unit = unitOf(byId.get(l.productId));
            return [
              { label: t("ui.stock.warehouse"), value: whName(l.warehouseId) },
              { label: t("ui.stock.tabStock"), value: fmtQty(l.qty, unit) },
              { label: t("ui.min.stockMin"), value: fmtQty(l.minQty, unit) },
              { label: t("ui.min.stockMissingHead"), value: fmtQty(l.missing, unit) },
            ];
          }}
          right={(l) => t("ui.min.stockMissing", { qty: fmtQty(l.missing, unitOf(byId.get(l.productId))) })}
          empty={{ title: t("ui.empty.lowTitle"), hint: t("ui.empty.lowBody") }}
        />
      ) : (
        <DataList
          rows={minRows}
          keyOf={(m) => m.id}
          title={(m) => name(m.productId)}
          subtitle={(m) => whName(m.warehouseId)}
          right={(m) => fmtQty(m.minQty, unitOf(byId.get(m.productId)))}
          onPress={onOpen}
          empty={{ title: t("ui.empty.minTitle") }}
        />
      )}
    </>
  );
}

/** Formulario para cargar o cambiar un mínimo; al editar ofrece borrarlo. */
export function MinSheet({ editor, products, warehouses }: { editor: MinEditor; products: Product[]; warehouses: WarehouseRow[] }) {
  const { draft, set } = editor;
  return (
    <FormSheet visible={!!draft} title={t("ui.min.stockNew")} onClose={editor.close} onSubmit={editor.submit} submitLabel={t("ui.common.save")} pending={editor.pending} error={editor.error}>
      <SelectField label={t("ui.stock.product")} value={draft?.productId} placeholder={t("ui.stock.pick")} options={products.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set({ productId: v })} />
      <SelectField label={t("ui.stock.warehouse")} value={draft?.warehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={(v) => set({ warehouseId: v })} />
      <TextField label={t("ui.min.stockMin")} value={draft?.minQty ?? ""} onChangeText={(v) => set({ minQty: v })} kind="decimal" />
      {draft?.id ? <Button kind="danger" title={t("ui.common.delete")} onPress={editor.doRemove} loading={editor.removing} style={{ marginTop: 16 }} /> : null}
    </FormSheet>
  );
}

interface BodyProps {
  mins: ReturnType<typeof useOnline<Minimum[]>>;
  lowRows: Low[];
  loading: boolean;
  needProduct: boolean;
  needWarehouse: boolean;
  byId: Map<string, Product>;
  whName: (id: string) => string;
  onOpen?: (m: Minimum) => void;
}

/** Cuerpo de la pantalla: carga, error, faltante de productos o depósitos, vacío o las pestañas. */
export function MinBody({ mins, lowRows, loading, needProduct, needWarehouse, byId, whName, onOpen }: BodyProps) {
  const [tab, setTab] = useState<"low" | "all">("low");
  const minRows = mins.data ?? [];
  if (loading) return <Skeleton rows={4} />;
  if (mins.error && mins.data === null) return <EmptyState title={t("office.common.loadFailed")} hint={mins.error} action={t("office.common.retry")} onAction={() => void mins.refresh()} />;
  if (needProduct || needWarehouse) return <EmptyState title={t(needProduct ? "ui.stock.needProductTitle" : "ui.stock.needWarehouseTitle")} hint={t(needProduct ? "ui.stock.needProductBody" : "ui.stock.needWarehouseBody")} />;
  if (minRows.length === 0) return <EmptyState title={t("ui.empty.minTitle")} hint={t("ui.empty.minBody")} />;
  return <MinTabs tab={tab} onTab={setTab} lowRows={lowRows} minRows={minRows} byId={byId} whName={whName} onOpen={onOpen} />;
}
