/**
 * Venta de granos (función 118): contratos con su avance, entregas con ticket y liquidaciones. Alta de lo más frecuente:
 * una entrega contra contrato (y la liquidación). /org/erp/grain-contracts/summary, /grain-deliveries, /grain-settlements.
 * Solo dueño y administrador. El contrato nuevo se carga desde la web.
 */
import { useState } from "react";
import { View } from "react-native";
import { Truck } from "lucide-react-native";
import { t, type Currency } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { showToast } from "../../../src/lib/toast";
import { useLocal } from "../../../src/lib/useLocal";
import { AdminGate, k, today, useParties } from "../../../src/office/adminKit";
import { isoShort, NoSignalNote, parseMinor, useNoSignalReason } from "../../../src/office/erpCommon";
import { fmtNumber, parseDecimal } from "../../../src/office/format";
import { fmtGs, fmtMoney } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, DateField, FormSheet, Segmented, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { Button } from "../../../src/ui/kit";

interface Contract {
  id: string;
  partyId: string | null;
  number: string | null;
  crop: string;
  tons: number;
  priceMinor: number;
  currency: Currency;
  deliveredTons: number;
  toDeliverTons: number;
  settledTons: number;
  toSettleTons: number;
}
interface Delivery {
  id: string;
  contractId: string;
  date: string;
  tons: number;
  ticket: string | null;
  moisturePct: number | null;
}
interface Settlement {
  id: string;
  contractId: string;
  date: string;
  tons: number;
  netAmount: number;
  netPyg: number;
  currency: Currency;
  dueDate: string | null;
  number: string | null;
}
type Tab = "contracts" | "deliveries" | "settlements";
interface Draft {
  kind: "delivery" | "settlement";
  contractId: string;
  date: string;
  tons: string;
  ticket: string;
  moisture: string;
  deductions: string;
  due: string;
  farmId: string;
}

export default function Grain() {
  const contracts = useOnline<Contract[]>("/org/erp/grain-contracts/summary");
  const deliveries = useOnline<Delivery[]>("/org/erp/grain-deliveries");
  const settlements = useOnline<Settlement[]>("/org/erp/grain-settlements");
  const parties = useParties();
  const farms = useLocal(() => getDb().farms());
  const [tab, setTab] = useState<Tab>("contracts");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const delivery = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/grain-deliveries", { invalidate: ["/org/erp"] });
  const settlement = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/grain-settlements", { invalidate: ["/org/erp"] });
  const noSignal = useNoSignalReason();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const list = contracts.data ?? [];
  const label = (c: Contract | undefined) => (c ? [t(k(`fields.crop_${c.crop}`)), c.number].filter(Boolean).join(" · ") : "?");
  const labelOf = (id: string) => label(list.find((c) => c.id === id));
  const party = (id: string | null) => parties.data?.find((p) => p.id === id)?.name;

  const open = (kind: Draft["kind"], c?: Contract) => {
    const target = c ?? list.find((x) => x.toDeliverTons > 0) ?? list[0];
    setFormError(null);
    delivery.reset();
    settlement.reset();
    setDraft({ kind, contractId: target?.id ?? "", date: today(), tons: kind === "settlement" && target?.toSettleTons ? String(target.toSettleTons).replace(".", ",") : "", ticket: "", moisture: "", deductions: "", due: "", farmId: farms.length === 1 ? farms[0]!.id : "" });
  };
  const pickContract = (id: string) => {
    const c = list.find((x) => x.id === id);
    set({ contractId: id, ...(draft?.kind === "settlement" && c?.toSettleTons ? { tons: String(c.toSettleTons).replace(".", ",") } : {}) });
  };

  const submit = async () => {
    if (!draft) return;
    const c = list.find((x) => x.id === draft.contractId);
    const tons = parseDecimal(draft.tons);
    if (!c) return setFormError(t("office.admNeedsContract"));
    if (tons === null || tons <= 0) return setFormError(t("office.admBadTons"));
    if (!draft.date) return setFormError(t("office.admNeedsDate"));
    setFormError(null);
    let r;
    if (draft.kind === "delivery") {
      const moisture = draft.moisture.trim() ? parseDecimal(draft.moisture) : null;
      if (moisture !== null && (moisture < 0 || moisture > 100)) return setFormError(t("office.admBadMoisture"));
      if (farms.length > 1 && !draft.farmId) return setFormError(t("office.admNeedsFarm"));
      r = await delivery.mutate({ contractId: c.id, date: draft.date, tons, farmId: draft.farmId || null, ticket: draft.ticket.trim() || null, moisturePct: moisture });
    } else {
      const ded = draft.deductions.trim() ? parseMinor(draft.deductions, c.currency) : null;
      if (draft.deductions.trim() && ded === null) return setFormError(t("office.admBadAmount"));
      r = await settlement.mutate({ contractId: c.id, date: draft.date, tons, number: draft.ticket.trim() || null, deductionsMinor: ded, dueDate: draft.due || null });
    }
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.erpSaved"));
    }
  };

  const all = [contracts, deliveries, settlements];
  const err = formError ?? (draft?.kind === "delivery" ? delivery.error : settlement.error);
  const totals = list.reduce((a, c) => ({ toDeliver: a.toDeliver + c.toDeliverTons, toSettle: a.toSettle + c.toSettleTons }), { toDeliver: 0, toSettle: 0 });

  return (
    <AdminGate need="manage" title={t("ui.adminSection_grain")}>
      <OfficeScreen
        title={t("ui.adminSection_grain")}
        query={contracts}
        onRefresh={async () => {
          await Promise.all([...all.map((x) => x.refresh()), parties.refresh()]);
        }}
        action={list.length > 0 ? { label: t("ui.grainAddDelivery"), icon: Truck, onPress: () => open("delivery"), disabled: !!noSignal } : undefined}
        footer={list.length > 0 ? <Button kind="secondary" title={t("ui.grainAddSettlement")} onPress={() => open("settlement")} disabled={!!noSignal} style={{ marginTop: 8 }} /> : undefined}
      >
        <NoSignalNote />
        <OnlineState query={contracts} empty={{ title: t("ui.emptyGrainTitle"), hint: t("ui.emptyGrainBody") }}>
          {() => (
            <>
              <StatRow items={[{ label: t("office.admGrainToDeliver"), value: `${fmtNumber(totals.toDeliver)} t` }, ...(totals.toSettle > 0 ? [{ label: t("office.admGrainToSettle"), value: `${fmtNumber(totals.toSettle)} t` }] : [])]} />
              <View style={{ marginTop: 16 }}>
                <Segmented<Tab>
                  value={tab}
                  onChange={setTab}
                  options={[{ value: "contracts", label: t("ui.grainTabContracts") }, { value: "deliveries", label: t("ui.grainDeliveries") }, { value: "settlements", label: t("ui.grainSettlements") }]}
                />
              </View>
              {tab === "contracts" ? (
                <DataList
                  rows={list}
                  keyOf={(c) => c.id}
                  title={label}
                  subtitle={(c) => [party(c.partyId), t("office.admGrainProgress", { d: fmtNumber(c.deliveredTons), t: fmtNumber(c.tons), s: fmtNumber(c.settledTons) })].filter(Boolean).join(" · ")}
                  right={(c) => `${fmtNumber(c.tons)} t`}
                  onPress={(c) => open("delivery", c)}
                  empty={{ title: t("ui.erpEmpty") }}
                />
              ) : tab === "deliveries" ? (
                <OnlineState query={deliveries} empty={{ title: t("ui.erpEmpty"), hint: t("ui.emptyDeliveriesBody") }}>
                  {(rows) => (
                    <DataList
                      rows={[...rows].sort((a, b) => b.date.localeCompare(a.date))}
                      keyOf={(d) => d.id}
                      title={(d) => labelOf(d.contractId)}
                      subtitle={(d) => [isoShort(d.date), d.ticket ? `${t("ui.grainTicket")} ${d.ticket}` : null, d.moisturePct !== null ? `${d.moisturePct} %` : null].filter(Boolean).join(" · ")}
                      right={(d) => `${fmtNumber(d.tons)} t`}
                      empty={{ title: t("ui.erpEmpty") }}
                    />
                  )}
                </OnlineState>
              ) : (
                <OnlineState query={settlements} empty={{ title: t("ui.erpEmpty"), hint: t("ui.emptySettlementsBody") }}>
                  {(rows) => (
                    <DataList
                      rows={[...rows].sort((a, b) => b.date.localeCompare(a.date))}
                      keyOf={(l) => l.id}
                      title={(l) => labelOf(l.contractId)}
                      subtitle={(l) => [isoShort(l.date), `${fmtNumber(l.tons)} t`, l.currency === "USD" ? fmtGs(l.netPyg) : null, l.dueDate ? t("ui.purchDue", { date: isoShort(l.dueDate) }) : null].filter(Boolean).join(" · ")}
                      right={(l) => fmtMoney(l.netAmount, l.currency)}
                      empty={{ title: t("ui.erpEmpty") }}
                    />
                  )}
                </OnlineState>
              )}
            </>
          )}
        </OnlineState>
        <FormSheet
          visible={!!draft}
          title={draft?.kind === "delivery" ? t("ui.grainAddDelivery") : t("ui.grainAddSettlement")}
          onClose={() => setDraft(null)}
          onSubmit={submit}
          submitLabel={t("ui.save")}
          pending={delivery.pending || settlement.pending}
          error={err}
        >
          <SelectField label={t("ui.grainContract")} value={draft?.contractId} options={list.map((c) => ({ value: c.id, label: label(c), hint: party(c.partyId) }))} onChange={pickContract} />
          <DateField label={t("ui.costDate")} value={draft?.date ?? ""} onChange={(v) => set({ date: v })} />
          <TextField label={t("ui.grainTons")} value={draft?.tons ?? ""} onChangeText={(v) => set({ tons: v })} kind="decimal" />
          <TextField label={draft?.kind === "delivery" ? t("ui.grainTicket") : t("ui.grainNumber")} value={draft?.ticket ?? ""} onChangeText={(v) => set({ ticket: v })} maxLength={40} autoCapitalize="none" />
          {draft?.kind === "delivery" ? (
            <>
              <TextField label={t("ui.grainMoisture")} value={draft.moisture} onChangeText={(v) => set({ moisture: v })} kind="decimal" />
              {farms.length > 1 ? <SelectField label={t("ui.farm")} value={draft.farmId} placeholder="—" options={farms.map((f) => ({ value: f.id, label: f.name }))} onChange={(v) => set({ farmId: v })} /> : null}
            </>
          ) : draft ? (
            <>
              <TextField label={t("ui.grainDeductions")} value={draft.deductions} onChangeText={(v) => set({ deductions: v })} kind="decimal" />
              <DateField label={t("ui.purchDueLabel")} value={draft.due} onChange={(v) => set({ due: v })} />
            </>
          ) : null}
        </FormSheet>
      </OfficeScreen>
    </AdminGate>
  );
}
