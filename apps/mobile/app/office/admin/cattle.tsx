/** Hacienda: compra y venta de animales (función 119): cabezas, kilos, precio por kilo y guía. /org/erp/cattle-deals (solo dueño y administrador). */
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
    const heads = parseDecimal(draft.heads);
    const kg = parseDecimal(draft.totalKg);
    const amount = parseMinor(draft.amount, draft.currency);
    if (heads === null || !Number.isInteger(heads) || heads < 1) return setFormError(t("office.admBadHeads"));
    if (kg === null || kg <= 0) return setFormError(t("office.admBadKg"));
    if (amount === null) return setFormError(t("office.admBadAmount"));
    if (!draft.date) return setFormError(t("office.admNeedsDate"));
    const body = { kind: draft.kind, date: draft.date, partyId: draft.partyId || null, category: draft.category.trim() || null, heads, totalKg: kg, amount, currency: draft.currency, guideNumber: draft.guide.trim() || null };
    const check = cattleDealInput.safeParse(body);
    if (!check.success) return setFormError(t("office.admCheckFields"));
    setFormError(null);
    const r = await create.mutate(body);
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erpSaved"));
    }
  };

  const sorted = [...(q.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const rows = sorted.filter((d) => filter === "all" || d.kind === filter);
  const headsOf = (kind: Kind) => (q.data ?? []).filter((d) => d.kind === kind).reduce((a, d) => a + d.heads, 0);

  return (
    <AdminGate need="manage" title={t("ui.adminSection_cattle")}>
      <OfficeScreen
        title={t("ui.adminSection_cattle")}
        query={q}
        onRefresh={async () => {
          await Promise.all([q.refresh(), parties.refresh()]);
        }}
        action={{ label: t("ui.cattleNew"), icon: Plus, onPress: open, disabled: !!noSignal }}
      >
        <NoSignalNote />
        <OnlineState query={q} empty={{ title: t("ui.emptyCattleTitle"), hint: t("ui.emptyCattleBody") }}>
          {(all) => (
            <>
              <StatRow items={[...(headsOf("sell") > 0 ? [{ label: t("office.admHeadsSold"), value: headsOf("sell") }] : []), ...(headsOf("buy") > 0 ? [{ label: t("office.admHeadsBought"), value: headsOf("buy") }] : [])]} />
              <FilterChips<"all" | Kind> value={filter} onChange={setFilter} options={[{ value: "all", label: t("ui.costAll"), count: all.length }, { value: "sell", label: t("ui.cattleKind_sell") }, { value: "buy", label: t("ui.cattleKind_buy") }]} />
              <DataList
                rows={rows}
                keyOf={(d) => d.id}
                title={(d) => [t(k(`ui.cattleKind_${d.kind}`)), d.category].filter(Boolean).join(" · ")}
                subtitle={(d) => [isoShort(d.date), party(d.partyId), d.pricePerKg !== null ? `${fmtMoney(Math.round(d.pricePerKg), d.currency)}/kg` : null, d.guideNumber ? `${t("ui.cattleGuide")} ${d.guideNumber}` : null].filter(Boolean).join(" · ")}
                right={(d) => (
                  <View style={{ alignItems: "flex-end" }}>
                    <RightText>{fmtMoney(d.amount, d.currency)}</RightText>
                    <Text style={T.small}>{t("office.admHeadsKg", { heads: d.heads, kg: fmtNumber(d.totalKg, 0) })}</Text>
                  </View>
                )}
                empty={{ title: t("ui.erpEmpty") }}
              />
            </>
          )}
        </OnlineState>
        <FormSheet visible={!!draft} title={t("ui.cattleNew")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.save")} pending={create.pending} error={formError ?? create.error}>
          <View style={{ marginTop: 16 }}>
            <Segmented<Kind> value={draft?.kind ?? "sell"} onChange={(v) => set({ kind: v })} options={CATTLE_DEAL_KINDS.map((v) => ({ value: v, label: t(k(`ui.cattleKind_${v}`)) }))} />
          </View>
          <DateField label={t("ui.costDate")} value={draft?.date ?? ""} onChange={(v) => set({ date: v })} />
          <SelectField label={t("ui.cattleParty")} value={draft?.partyId ?? ""} placeholder="—" options={[{ value: "", label: "—" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ partyId: v })} />
          <TextField label={t("ui.cattleCategory")} value={draft?.category ?? ""} onChangeText={(v) => set({ category: v })} maxLength={60} />
          <TextField label={t("ui.cattleHeads")} value={draft?.heads ?? ""} onChangeText={(v) => set({ heads: v })} kind="number" />
          <TextField label={t("ui.cattleKg")} value={draft?.totalKg ?? ""} onChangeText={(v) => set({ totalKg: v })} kind="decimal" />
          <View style={{ marginTop: 16 }}>
            <Segmented<Currency> value={draft?.currency ?? "PYG"} onChange={(v) => set({ currency: v })} options={CURRENCY_OPTIONS} />
          </View>
          <TextField label={t("ui.cattleAmount")} value={draft?.amount ?? ""} onChangeText={(v) => set({ amount: v })} kind="decimal" />
          <TextField label={t("ui.cattleGuide")} value={draft?.guide ?? ""} onChangeText={(v) => set({ guide: v })} maxLength={40} autoCapitalize="none" />
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
