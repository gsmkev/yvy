/**
 * Productos: catálogo desde la base local (anda sin señal) con carencia y dosis habitual (esta última por
 * REST: no se sincroniza). Alta, edición y borrado por REST para quien la API deja (dueño, administrador y agrónomo);
 * el supervisor ve. La receta agronómica la arma cualquiera de oficina y se manda como tareas a un empleado.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { FilePlus2, Plus } from "lucide-react-native";
import { isFieldRole, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { localSeasons, matchesQuery } from "../../src/lib/plotInfo";
import { useSession } from "../../src/lib/session";
import { syncNow } from "../../src/lib/sync";
import { useLocal } from "../../src/lib/useLocal";
import { useFarmPick } from "../../src/office/farmPick";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { PrescriptionSheet } from "../../src/office/PrescriptionSheet";
import { doseText, type DoseRange } from "../../src/office/products/draft";
import { ProductFormSheet, RemoveProductSheet } from "../../src/office/products/ProductSheets";
import { useProductEditor } from "../../src/office/products/useProductEditor";
import { DataList, FilterChips, TextField } from "../../src/office/ui";
import { useOnline } from "../../src/office/useOnline";
import { Button, EmptyState } from "../../src/ui/kit";

const k = (s: string) => s as MessageKey;

/** Catálogo de productos del establecimiento con sus rangos de dosis. */
export default function Products() {
  const role = useSession()?.organization.role;
  const canEdit = role === "owner" || role === "admin" || role === "agronomist";
  const canPrescribe = !!role && !isFieldRole(role);
  const { farms } = useFarmPick();
  const data = useLocal(() => {
    const db = getDb();
    return { products: db.products(), plots: db.plots(), seasons: localSeasons(db) };
  });
  const ranges = useOnline<DoseRange[]>("/org/products/dose-ranges");
  const rangeOf = useMemo(() => new Map((ranges.data ?? []).map((r) => [r.productId, r])), [ranges.data]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [rx, setRx] = useState(false);
  const editor = useProductEditor(rangeOf, () => void ranges.refresh());

  const types = [...new Set(data.products.map((p) => p.type))];
  const shown = data.products.filter((p) => (type === "all" || p.type === type) && (!query.trim() || matchesQuery(query, p.name, p.activeIngredient)));
  const farmId = farms[0]?.id ?? "";
  const newProduct = () => editor.open(null);

  return (
    <OfficeScreen
      title={t("ui.products.title")}
      query={ranges}
      onRefresh={async () => {
        await syncNow();
        await ranges.refresh();
      }}
      refreshing={false}
      action={canPrescribe && farmId ? { label: t("ui.prescription.new"), icon: FilePlus2, onPress: () => setRx(true) } : canEdit ? { label: t("ui.product.new"), icon: Plus, onPress: newProduct } : undefined}
      footer={canPrescribe && farmId && canEdit ? <Button kind="secondary" icon={Plus} title={t("ui.product.new")} onPress={newProduct} /> : undefined}
    >
      {data.products.length === 0 ? (
        <EmptyState title={t("ui.empty.productsTitle")} hint={t("ui.empty.productsBody")} action={canEdit ? t("ui.product.new") : undefined} onAction={newProduct} />
      ) : (
        <>
          <View style={{ marginTop: 16 }}>
            <TextField label={t("ui.common.search")} value={query} onChangeText={setQuery} placeholder={t("office.product.search")} autoCapitalize="none" />
          </View>
          {types.length > 1 && (
            <FilterChips
              value={type}
              onChange={setType}
              options={[{ value: "all", label: t("ui.products.allTypes"), count: data.products.length }, ...types.map((x) => ({ value: x as string, label: t(k(`fields.product.type_${x}`)), count: data.products.filter((p) => p.type === x).length }))]}
            />
          )}
          <DataList
            rows={shown}
            keyOf={(p) => p.id}
            title={(p) => p.name}
            subtitle={(p) =>
              [t(k(`fields.product.type_${p.type}`)), t(k(`fields.product.unit_${p.unit}`)), p.activeIngredient, p.withdrawalDays !== null ? t("office.product.withdrawal", { n: p.withdrawalDays }) : null, doseText(p, rangeOf.get(p.id))]
                .filter(Boolean)
                .join(", ")
            }
            onPress={canEdit ? editor.open : undefined}
            empty={{ title: t("ui.erp.empty") }}
          />
        </>
      )}
      <ProductFormSheet editor={editor} onDelete={(id) => editor.askRemove(data.products.find((p) => p.id === id) ?? null)} />
      <RemoveProductSheet editor={editor} />
      {canPrescribe && farmId ? <PrescriptionSheet visible={rx} onClose={() => setRx(false)} farms={farms} plots={data.plots} products={data.products} seasons={data.seasons.filter((x) => x.active)} /> : null}
    </OfficeScreen>
  );
}
