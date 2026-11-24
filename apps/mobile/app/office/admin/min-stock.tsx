/**
 * Stock mínimo y faltantes (función 121): lo que hay que reponer y el mínimo de cada producto y depósito.
 * Lo ven dueño, administrador y agrónomo; cargar o quitar mínimos, dueño y administrador.
 * /org/erp/stock/low, /stock/minimums (GET, PUT) y DELETE /stock/minimums/:id.
 */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { t } from "@yvy/shared";
import { showToast } from "../../../src/lib/toast";
import { AdminGate, unitOf, useAdminAccess, useProductMap, useWarehouses } from "../../../src/office/adminKit";
import { NoSignalNote, useNoSignalReason } from "../../../src/office/erpCommon";
import { parseDecimal } from "../../../src/office/format";
import { fmtQty } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { Skeleton } from "../../../src/office/state";
import { DataList, FormSheet, Segmented, SelectField, TextField } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { Button, EmptyState } from "../../../src/ui/kit";

interface Minimum {
  id: string;
  productId: string;
  warehouseId: string;
  minQty: number;
}
interface Low {
  productId: string;
  warehouseId: string;
  qty: number;
  minQty: number;
  missing: number;
}
interface Draft {
  id: string | null;
  productId: string;
  warehouseId: string;
  minQty: string;
}

export default function MinStock() {
  const { manage } = useAdminAccess();
  const mins = useOnline<Minimum[]>("/org/erp/stock/minimums");
  const low = useOnline<Low[]>("/org/erp/stock/low");
  const wh = useWarehouses();
  const { products, byId } = useProductMap();
  const [tab, setTab] = useState<"low" | "all">("low");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<{ productId: string; warehouseId: string; minQty: number }, { ok: boolean }>("PUT", "/org/erp/stock/minimums", { invalidate: ["/org/erp"] });
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/erp/stock/minimums/${b.id}`, { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const warehouses = wh.data ?? [];
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";
  const minRows = mins.data ?? [];
  const lowRows = low.data ?? [];

  const open = (m: Minimum | null) => {
    if (!manage) return;
    setFormError(null);
    save.reset();
    remove.reset();
    setDraft(m ? { id: m.id, productId: m.productId, warehouseId: m.warehouseId, minQty: String(m.minQty).replace(".", ",") } : { id: null, productId: "", warehouseId: warehouses[0]?.id ?? "", minQty: "" });
  };
  const submit = async () => {
    if (!draft) return;
    if (!draft.productId) return setFormError(t("office.adm.needsProduct"));
    if (!draft.warehouseId) return setFormError(t("ui.stock.noWarehouse"));
    const n = parseDecimal(draft.minQty);
    if (n === null || n < 0) return setFormError(t("office.adm.badQty"));
    setFormError(null);
    const r = await save.mutate({ productId: draft.productId, warehouseId: draft.warehouseId, minQty: n });
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erp.saved"));
    }
  };
  const doRemove = async () => {
    if (!draft?.id) return;
    const r = await remove.mutate({ id: draft.id });
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erp.deleted"));
    }
  };

  const loading = (mins.loading || low.loading || wh.loading) && mins.data === null;
  const needProduct = products.length === 0;
  const needWarehouse = wh.data !== null && warehouses.length === 0;
  const err = formError ?? save.error ?? remove.error;
  return (
    <AdminGate need="stock" title={t("ui.admin.section_minstock")}>
      <OfficeScreen
        title={t("ui.admin.section_minstock")}
        query={mins}
        onRefresh={async () => {
          await Promise.all([mins.refresh(), low.refresh(), wh.refresh()]);
        }}
        action={manage && !needProduct && !needWarehouse ? { label: t("ui.min.stockNew"), icon: Plus, onPress: () => open(null), disabled: !!noSignal } : undefined}
      >
        {manage ? <NoSignalNote /> : null}
        {loading ? (
          <Skeleton rows={4} />
        ) : mins.error && mins.data === null ? (
          <EmptyState title={t("office.common.loadFailed")} hint={mins.error} action={t("office.common.retry")} onAction={() => void mins.refresh()} />
        ) : needProduct || needWarehouse ? (
          <EmptyState title={t(needProduct ? "ui.stock.needProductTitle" : "ui.stock.needWarehouseTitle")} hint={t(needProduct ? "ui.stock.needProductBody" : "ui.stock.needWarehouseBody")} />
        ) : minRows.length === 0 ? (
          <EmptyState title={t("ui.empty.minTitle")} hint={t("ui.empty.minBody")} />
        ) : (
          <>
            <View style={{ marginTop: 16 }}>
              <Segmented<"low" | "all"> value={tab} onChange={setTab} options={[{ value: "low", label: `${t("ui.min.tabLow")} · ${lowRows.length}` }, { value: "all", label: `${t("ui.min.tabAll")} · ${minRows.length}` }]} />
            </View>
            {tab === "low" ? (
              <DataList
                rows={lowRows}
                keyOf={(l) => `${l.productId}-${l.warehouseId}`}
                title={(l) => byId.get(l.productId)?.name ?? "—"}
                subtitle={(l) =>
                  whName(l.warehouseId) +
                  " · " +
                  t("office.adm.haveOfMin", {
                    qty: fmtQty(l.qty, unitOf(byId.get(l.productId))),
                    min: fmtQty(l.minQty),
                  })
                }
                right={(l) => t("ui.min.stockMissing", { qty: fmtQty(l.missing, unitOf(byId.get(l.productId))) })}
                empty={{ title: t("ui.empty.lowTitle"), hint: t("ui.empty.lowBody") }}
              />
            ) : (
              <DataList
                rows={minRows}
                keyOf={(m) => m.id}
                title={(m) => byId.get(m.productId)?.name ?? "—"}
                subtitle={(m) => whName(m.warehouseId)}
                right={(m) => fmtQty(m.minQty, unitOf(byId.get(m.productId)))}
                onPress={manage ? open : undefined}
                empty={{ title: t("ui.empty.minTitle") }}
              />
            )}
          </>
        )}
        <FormSheet visible={!!draft} title={t("ui.min.stockNew")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={err}>
          <SelectField label={t("ui.stock.product")} value={draft?.productId} placeholder={t("ui.stock.pick")} options={products.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set({ productId: v })} />
          <SelectField label={t("ui.stock.warehouse")} value={draft?.warehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={(v) => set({ warehouseId: v })} />
          <TextField label={t("ui.min.stockMin")} value={draft?.minQty ?? ""} onChangeText={(v) => set({ minQty: v })} kind="decimal" />
          {draft?.id ? <Button kind="danger" title={t("ui.common.delete")} onPress={doRemove} loading={remove.pending} style={{ marginTop: 16 }} /> : null}
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
