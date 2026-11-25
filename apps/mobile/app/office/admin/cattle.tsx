/** Hacienda: compra y venta de animales; cabezas, kilos, precio por kilo y guía. /org/erp/cattle-deals (solo dueño y administrador). */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { CATTLE_DEAL_KINDS, cattleDealInput, t, type Currency } from "@yvy/shared";
import { showToast } from "../../../src/lib/toast";
import { AdminGate, CURRENCY_OPTIONS, k, RightText, today, useParties } from "../../../src/office/adminKit";
import { isoShort, NoSignalNote, parseMinor, useNoSignalReason } from "../../../src/office/erpCommon";
import { fmtNumber, parseDecimal } from "../../../src/office/format";
import { fmtMoney } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, DateField, FilterChips, FormSheet, Segmented, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

type Kind = (typeof CATTLE_DEAL_KINDS)[number];
interface Deal {
  id: string;
  kind: Kind;
  date: string;
  partyId: string | null;
  category: string | null;
  heads: number;
  totalKg: number;
  amount: number;
  currency: Currency;
  guideNumber: string | null;
  pricePerKg: number | null;
  kgPerHead: number | null;
}
interface Draft {
  kind: Kind;
  date: string;
  partyId: string;
  category: string;
  heads: string;
  totalKg: string;
  currency: Currency;
  amount: string;
  guide: string;
}
const blank = (): Draft => ({ kind: "sell", date: today(), partyId: "", category: "", heads: "", totalKg: "", currency: "PYG", amount: "", guide: "" });

/** Valida el formulario y arma el cuerpo del pedido; devuelve el texto del error si algo no cierra. */
function dealBody(draft: Draft): { body: Record<string, unknown> } | { error: string } {
  const heads = parseDecimal(draft.heads);
  const kg = parseDecimal(draft.totalKg);
  const amount = parseMinor(draft.amount, draft.currency);
  if (heads === null || !Number.isInteger(heads) || heads < 1) return { error: t("office.adm.badHeads") };
  if (kg === null || kg <= 0) return { error: t("office.adm.badKg") };
  if (amount === null) return { error: t("office.adm.badAmount") };
  if (!draft.date) return { error: t("office.adm.needsDate") };
  const body = { kind: draft.kind, date: draft.date, partyId: draft.partyId || null, category: draft.category.trim() || null, heads, totalKg: kg, amount, currency: draft.currency, guideNumber: draft.guide.trim() || null };
  return cattleDealInput.safeParse(body).success ? { body } : { error: t("office.adm.checkFields") };
}

/** Compra y venta de hacienda. */
export default function Cattle() {
  const q = useOnline<Deal[]>("/org/erp/cattle-deals");
  const parties = useParties();
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", "/org/erp/cattle-deals", { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name;

  const open = () => {
    setFormError(null);
    create.reset();
    setDraft(blank());
  };
  const submit = async () => {
    if (!draft) return;
    const built = dealBody(draft);
    if ("error" in built) return setFormError(built.error);
    setFormError(null);
    const r = await create.mutate(built.body);
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erp.saved"));
    }
  };

  const sorted = [...(q.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const rows = sorted.filter((d) => filter === "all" || d.kind === filter);
  const headsOf = (kind: Kind) => (q.data ?? []).filter((d) => d.kind === kind).reduce((a, d) => a + d.heads, 0);

  const d = draft ?? blank();
  return (
    <AdminGate need="manage" title={t("ui.admin.section_cattle")}>
      <OfficeScreen
        title={t("ui.admin.section_cattle")}
        query={q}
        onRefresh={async () => {
          await Promise.all([q.refresh(), parties.refresh()]);
        }}
        action={{ label: t("ui.cattle.new"), icon: Plus, onPress: open, disabled: !!noSignal }}
      >
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.empty.cattleTitle"), hint: t("ui.empty.cattleBody") }}>
          {(all) => (
            <>
              <StatRow items={[...(headsOf("sell") > 0 ? [{ label: t("office.adm.headsSold"), value: headsOf("sell") }] : []), ...(headsOf("buy") > 0 ? [{ label: t("office.adm.headsBought"), value: headsOf("buy") }] : [])]} />
              <FilterChips<"all" | Kind> value={filter} onChange={setFilter} options={[{ value: "all", label: t("ui.cost.all"), count: all.length }, { value: "sell", label: t("ui.cattle.kind_sell") }, { value: "buy", label: t("ui.cattle.kind_buy") }]} />
              <DataList
                rows={rows}
                keyOf={(d) => d.id}
                title={(d) => [t(k(`ui.cattle.kind_${d.kind}`)), d.category].filter(Boolean).join(", ")}
                subtitle={(d) => [isoShort(d.date), party(d.partyId)].filter(Boolean).join(", ")}
                detail={(d) => [
                  { label: t("ui.cost.date"), value: isoShort(d.date) },
                  ...(party(d.partyId) ? [{ label: t("ui.cattle.party"), value: party(d.partyId)! }] : []),
                  ...(d.pricePerKg !== null ? [{ label: t("ui.cattle.pricePerKg"), value: `${fmtMoney(Math.round(d.pricePerKg), d.currency)}/kg` }] : []),
                  ...(d.guideNumber ? [{ label: t("ui.cattle.guide"), value: d.guideNumber }] : []),
                ]}
                right={(d) => (
                  <View style={{ alignItems: "flex-end" }}>
                    <RightText>{fmtMoney(d.amount, d.currency)}</RightText>
                    <Text style={T.small}>{t("office.adm.headsKg", { heads: d.heads, kg: fmtNumber(d.totalKg, 0) })}</Text>
                  </View>
                )}
                empty={{ title: t("ui.erp.empty") }}
              />
            </>
          )}
        </OnlineState>
        <FormSheet visible={!!draft} title={t("ui.cattle.new")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending} error={formError ?? create.error}>
          <View style={{ marginTop: 16 }}>
            <Segmented<Kind> value={d.kind} onChange={(v) => set({ kind: v })} options={CATTLE_DEAL_KINDS.map((v) => ({ value: v, label: t(k(`ui.cattle.kind_${v}`)) }))} />
          </View>
          <DateField label={t("ui.cost.date")} value={d.date} onChange={(v) => set({ date: v })} />
          <SelectField label={t("ui.cattle.party")} value={d.partyId} placeholder="—" options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ partyId: v })} />
          <TextField label={t("ui.cattle.category")} value={d.category} onChangeText={(v) => set({ category: v })} maxLength={60} />
          <TextField label={t("ui.cattle.heads")} value={d.heads} onChangeText={(v) => set({ heads: v })} kind="number" />
          <TextField label={t("ui.cattle.kg")} value={d.totalKg} onChangeText={(v) => set({ totalKg: v })} kind="decimal" />
          <View style={{ marginTop: 16 }}>
            <Segmented<Currency> value={d.currency} onChange={(v) => set({ currency: v })} options={CURRENCY_OPTIONS} />
          </View>
          <TextField label={t("ui.cattle.amount")} value={d.amount} onChangeText={(v) => set({ amount: v })} kind="decimal" />
          <TextField label={t("ui.cattle.guide")} value={d.guide} onChangeText={(v) => set({ guide: v })} maxLength={40} autoCapitalize="none" />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
