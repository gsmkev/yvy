/**
 * Productos (función 60): catálogo desde la base local (anda sin señal) con carencia y dosis habitual (esta última por
 * REST: no se sincroniza). Alta, edición y borrado por REST para quien la API deja (dueño, administrador y agrónomo);
 * el supervisor ve. La receta agronómica la arma cualquiera de oficina y se manda como tareas a un empleado.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { FilePlus2, Plus } from "lucide-react-native";
import { isFieldRole, PRODUCT_TYPES, PRODUCT_UNITS, t, type MessageKey } from "@yvy/shared";
import type { Product } from "../../src/db/store";
import { getDb } from "../../src/lib/db";
import { localSeasons, matchesQuery } from "../../src/lib/plotInfo";
import { useSession } from "../../src/lib/session";
import { syncNow } from "../../src/lib/sync";
import { showToast } from "../../src/lib/toast";
import { useLocal } from "../../src/lib/useLocal";
import { useFarmPick } from "../../src/office/farmPick";
import { fmtNumber, parseDecimal } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { PrescriptionSheet } from "../../src/office/PrescriptionSheet";
import { DataList, FilterChips, FormSheet, SelectField, TextField } from "../../src/office/ui";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { Button, EmptyState, Sheet, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

const k = (s: string) => s as MessageKey;

interface DoseRange {
  productId: string;
  min: number | null;
  max: number | null;
}

interface Draft {
  id: string | null;
  name: string;
  type: string;
  unit: string;
  ingredient: string;
  withdrawal: string;
  tox: string;
  doseMin: string;
  doseMax: string;
}

const numText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const doseUnit = (u: string) => (u === "l" ? "l/ha" : "kg/ha");

function doseText(p: Product, r: DoseRange | undefined): string | null {
  if (!r || (r.min === null && r.max === null)) return null;
  const range = r.min !== null && r.max !== null ? `${fmtNumber(r.min, 2)} a ${fmtNumber(r.max, 2)}` : r.min !== null ? `${t("ui.review.atLeast")} ${fmtNumber(r.min, 2)}` : `${t("ui.review.upTo")} ${fmtNumber(r.max!, 2)}`;
  return t("ui.product.doseShown", { range, unit: doseUnit(p.unit) });
}

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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [rx, setRx] = useState(false);

  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/products");
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/products/${b.id}`);
  const dose = useOnlineMutation<{ id: string; min: number | null; max: number | null }, { ok: boolean }>("PUT", (b) => `/org/products/${b.id}/dose-range`, { invalidate: ["/org/products"] });
  const remove = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/products/${b.id}`);

  const types = [...new Set(data.products.map((p) => p.type))];
  const shown = data.products.filter((p) => (type === "all" || p.type === type) && (!query.trim() || matchesQuery(query, p.name, p.activeIngredient)));

  const openDraft = (p: Product | null) => {
    create.reset();
    edit.reset();
    dose.reset();
    setFormError(null);
    const r = p ? rangeOf.get(p.id) : undefined;
    setDraft({ id: p?.id ?? null, name: p?.name ?? "", type: p?.type ?? "agrochemical", unit: p?.unit ?? "l", ingredient: p?.activeIngredient ?? "", withdrawal: numText(p?.withdrawalDays), tox: p?.toxClass ?? "", doseMin: numText(r?.min), doseMax: numText(r?.max) });
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const submit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setFormError(t("office.product.needsName"));
    const wd = draft.withdrawal.trim() ? parseDecimal(draft.withdrawal) : null;
    const min = draft.doseMin.trim() ? parseDecimal(draft.doseMin) : null;
    const max = draft.doseMax.trim() ? parseDecimal(draft.doseMax) : null;
    if ((draft.withdrawal.trim() && (wd === null || !Number.isInteger(wd) || wd < 0 || wd > 365)) || (draft.doseMin.trim() && (min === null || min < 0)) || (draft.doseMax.trim() && (max === null || max < 0))) return setFormError(t("office.season.badNumber"));
    if (min !== null && max !== null && min > max) return setFormError(t("office.product.doseOrder"));
    setFormError(null);
    const body = { name, type: draft.type, unit: draft.unit, activeIngredient: draft.ingredient.trim() || null, withdrawalDays: wd, toxClass: draft.tox.trim() || null };
    const saved = draft.id ? await edit.mutate({ id: draft.id, ...body }).then((r) => (r.ok ? { ok: true as const, id: draft.id! } : r)) : await create.mutate(body).then((r) => (r.ok ? { ok: true as const, id: r.data.id } : r));
    if (!saved.ok) return;
    // La dosis habitual va aparte del producto (como en la web); si falla, el producto ya quedó guardado.
    const hadRange = draft.id ? rangeOf.has(draft.id) : false;
    if (min !== null || max !== null || hadRange) {
      const d = await dose.mutate({ id: saved.id, min, max });
      if (!d.ok) return;
    }
    setDraft(null);
    showToast(t("ui.toast.productSaved"));
    void ranges.refresh();
    void syncNow();
  };

  const err = formError ?? edit.error ?? create.error ?? dose.error;
  const farmId = farms[0]?.id ?? "";

  return (
    <OfficeScreen
      title={t("ui.products.title")}
      query={ranges}
      onRefresh={async () => {
        await syncNow();
        await ranges.refresh();
      }}
      refreshing={false}
      action={canPrescribe && farmId ? { label: t("ui.prescription.new"), icon: FilePlus2, onPress: () => setRx(true) } : canEdit ? { label: t("ui.product.new"), icon: Plus, onPress: () => openDraft(null) } : undefined}
      footer={canPrescribe && farmId && canEdit ? <Button kind="secondary" icon={Plus} title={t("ui.product.new")} onPress={() => openDraft(null)} /> : undefined}
    >
      {data.products.length === 0 ? (
        <EmptyState title={t("ui.empty.productsTitle")} hint={t("ui.empty.productsBody")} action={canEdit ? t("ui.product.new") : undefined} onAction={() => openDraft(null)} />
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
                .join(" · ")
            }
            onPress={canEdit ? openDraft : undefined}
            empty={{ title: t("ui.erp.empty") }}
          />
        </>
      )}

      <FormSheet visible={!!draft} title={draft?.id ? t("office.product.editTitle") : t("ui.product.new")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending || edit.pending || dose.pending} error={err}>
        {draft ? (
          <>
            <TextField label={t("ui.product.name")} value={draft.name} onChangeText={(v) => set({ name: v })} maxLength={120} />
            <SelectField label={t("ui.product.type")} value={draft.type} options={PRODUCT_TYPES.map((x) => ({ value: x as string, label: t(k(`fields.product.type_${x}`)) }))} onChange={(v) => set({ type: v })} />
            <SelectField label={t("ui.product.unit")} value={draft.unit} options={PRODUCT_UNITS.map((x) => ({ value: x as string, label: t(k(`fields.product.unit_${x}`)) }))} onChange={(v) => set({ unit: v })} />
            <TextField label={t("ui.product.activeIngredient")} value={draft.ingredient} onChangeText={(v) => set({ ingredient: v })} maxLength={120} />
            <TextField label={t("ui.product.withdrawal")} kind="number" value={draft.withdrawal} onChangeText={(v) => set({ withdrawal: v.replace(/\D/g, "") })} />
            <TextField label={t("ui.product.toxClass")} value={draft.tox} onChangeText={(v) => set({ tox: v })} maxLength={40} />
            <Text style={[T.heading, { marginTop: 24 }]}>{t("ui.product.doseTitle")}</Text>
            <Text style={[T.small, { marginTop: 4 }]}>{t("ui.product.doseHint")}</Text>
            <TextField label={t("ui.product.doseMin", { unit: doseUnit(draft.unit) })} kind="decimal" value={draft.doseMin} onChangeText={(v) => set({ doseMin: v })} />
            <TextField label={t("ui.product.doseMax", { unit: doseUnit(draft.unit) })} kind="decimal" value={draft.doseMax} onChangeText={(v) => set({ doseMax: v })} />
            {draft.id ? (
              <Button
                kind="text"
                title={t("office.product.delete")}
                onPress={() => {
                  remove.reset();
                  setRemoving(data.products.find((p) => p.id === draft.id) ?? null);
                  setDraft(null);
                }}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </>
        ) : null}
      </FormSheet>

      <Sheet visible={!!removing} title={t("office.product.delete")} onClose={() => setRemoving(null)}>
        {removing ? (
          <>
            <Text style={T.body}>{t("ui.product.confirmDelete", { name: removing.name })}</Text>
            {remove.error ? (
              <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
                {remove.error}
              </Text>
            ) : null}
            <Button
              kind="danger"
              title={t("ui.common.delete")}
              loading={remove.pending}
              onPress={() =>
                void remove.mutate({ id: removing.id }).then((r) => {
                  if (r.ok) {
                    setRemoving(null);
                    showToast(t("ui.toast.productDeleted"));
                    void syncNow();
                  }
                })
              }
              style={{ marginTop: 16 }}
            />
            <Button kind="text" title={t("ui.common.cancel")} onPress={() => setRemoving(null)} style={{ marginTop: 4 }} />
          </>
        ) : null}
      </Sheet>

      {canPrescribe && farmId ? <PrescriptionSheet visible={rx} onClose={() => setRx(false)} farms={farms} plots={data.plots} products={data.products} seasons={data.seasons.filter((x) => x.active)} /> : null}
    </OfficeScreen>
  );
}
