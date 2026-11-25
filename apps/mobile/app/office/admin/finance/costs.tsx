/**
 * Libro de costos y ventas: filtro por estancia y campaña, totales y alta de un costo o una venta.
 * API: GET /org/erp/costs?farmId&seasonId, POST /org/erp/costs, GET /org/erp/parties (apps/api/src/routes/erp/).
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { ACTIVITIES, COST_CATEGORIES, CURRENCIES, localDate, t, type Currency, type MessageKey } from "@yvy/shared";
import { getDb } from "../../../../src/lib/db";
import { showToast } from "../../../../src/lib/toast";
import { useLocal } from "../../../../src/lib/useLocal";
import { MoneyStats, NoAdminAccess, NoSignalNote, parseMinor, useErp, useManageErp, useNoSignalReason, useSeasonList, isoShort, type Party } from "../../../../src/office/erpCommon";
import { fmtGs, fmtMoney } from "../../../../src/office/money";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { OnlineState } from "../../../../src/office/state";
import { useOnlineMutation } from "../../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, SelectField, TextField } from "../../../../src/office/ui";
import { SectionHeader, Text } from "../../../../src/ui/kit";
import { C, T } from "../../../../src/ui/theme";

interface CostEntry {
  id: string;
  occurredAt: number;
  farmId: string | null;
  plotId: string | null;
  seasonId: string | null;
  activity: string;
  category: string;
  description: string | null;
  amount: number;
  currency: Currency;
  amountPyg: number;
  origin: string;
}
interface CostList {
  rows: CostEntry[];
  totals: { costPyg: number; incomePyg: number };
}

const key = (k: string) => k as MessageKey;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Costos: carga de gastos imputados a lotes o estancias. */
export default function Costs() {
  const allowed = useManageErp();
  const [farmId, setFarmId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [adding, setAdding] = useState(false);
  const noSignal = useNoSignalReason();
  const farms = useLocal(() => getDb().farms());
  const seasons = useSeasonList();
  const qs = [farmId && `farmId=${farmId}`, seasonId && `seasonId=${seasonId}`].filter(Boolean).join("&");
  const q = useErp<CostList>(allowed ? `/org/erp/costs${qs ? `?${qs}` : ""}` : null);
  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);
  if (!allowed) return <NoAdminAccess title={t("ui.admin.section_costs")} />;
  const filtered = !!(farmId || seasonId);
  const none = t("ui.cost.all");

  return (
    <OfficeScreen
      title={t("ui.admin.section_costs")}
      query={q}
      action={{ label: t("ui.cost.new"), icon: Plus, onPress: () => setAdding(true), disabled: !!noSignal }}
      footer={<NoSignalNote />}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SelectField label={t("ui.cost.farm")} value={farmId} options={[{ value: "", label: none }, ...farms.map((f) => ({ value: f.id, label: f.name }))]} onChange={setFarmId} />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField label={t("ui.cost.season")} value={seasonId} options={[{ value: "", label: none }, ...(seasons.data?.seasons ?? []).map((s) => ({ value: s.id, label: s.name }))]} onChange={setSeasonId} />
        </View>
      </View>
      <OnlineState
        query={q}
        isEmpty={(d) => d.rows.length === 0}
        empty={filtered ? { title: t("ui.cost.emptyFiltered"), action: t("ui.cost.clearFilters"), onAction: () => (setFarmId(""), setSeasonId("")) } : { title: t("ui.cost.emptyTitle"), hint: t("ui.cost.emptyHint") }}
      >
        {(d) => {
          const result = d.totals.incomePyg - d.totals.costPyg;
          return (
            <>
              <MoneyStats
                items={[
                  { label: t("ui.cost.totalCost"), value: fmtGs(d.totals.costPyg) },
                  { label: t("ui.cost.totalIncome"), value: fmtGs(d.totals.incomePyg) },
                  { label: t("ui.cost.result"), value: fmtGs(result), tone: result < 0 ? "danger" : undefined },
                ]}
              />
              <SectionHeader title={t("ui.admin.section_costs")} />
              <DataList
                rows={d.rows}
                keyOf={(c) => c.id}
                title={(c) => c.description || t(key(`ui.cost.category_${c.category}`))}
                subtitle={(c) => `${isoShort(dayOf(c.occurredAt))}, ${t(key(`ui.cost.category_${c.category}`))}`}
                detail={(c) => [
                  { label: t("ui.cost.date"), value: isoShort(dayOf(c.occurredAt)) },
                  { label: t("ui.cost.category"), value: t(key(`ui.cost.category_${c.category}`)) },
                  ...(c.farmId && farmName.get(c.farmId) ? [{ label: t("ui.cost.farm"), value: farmName.get(c.farmId)! }] : []),
                  { label: t("ui.cost.amount"), value: fmtMoney(c.amount, c.currency) },
                  ...(c.origin !== "manual" ? [{ label: t("ui.cost.from"), value: t("ui.cost.fromRecord") }] : []),
                ]}
                right={(c) => (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[T.bodyMedium, c.category === "sale" && { color: C.accionOscuro }]}>{`${c.category === "sale" ? "" : "-"}${fmtMoney(c.amount, c.currency)}`}</Text>
                    {c.currency !== "PYG" ? <Text style={T.small}>{fmtGs(c.amountPyg)}</Text> : null}
                  </View>
                )}
                empty={{ title: t("ui.cost.emptyTitle") }}
              />
            </>
          );
        }}
      </OnlineState>
      {adding ? <CostSheet onClose={() => setAdding(false)} /> : null}
    </OfficeScreen>
  );
}

function CostSheet({ onClose }: { onClose: () => void }) {
  const farms = useLocal(() => getDb().farms());
  const plots = useLocal(() => getDb().plots());
  const seasons = useSeasonList();
  const parties = useErp<Party[]>("/org/erp/parties");
  const [f, setF] = useState({ date: localDate(Date.now()), category: "other", activity: "agricultura", seasonId: "", farmId: "", plotId: "", description: "", currency: "PYG", amount: "", tons: "", partyId: "" });
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/costs", { invalidate: ["/org/erp/costs", "/org/erp/results"] });
  const none = { value: "", label: t("ui.cost.none") };
  const submit = async () => {
    const minor = parseMinor(f.amount, f.currency as Currency);
    const e: typeof errors = {};
    if (minor === null) e.amount = t("office.common.moneyNeedsAmount");
    if (!f.date) e.date = t("office.common.invalidDate");
    setErrors(e);
    if (Object.keys(e).length || minor === null) return;
    const tons = f.category === "sale" && f.tons ? Number(f.tons.replace(",", ".")) : null;
    const r = await save.mutate({
      date: f.date,
      activity: f.activity,
      category: f.category,
      farmId: f.farmId || null,
      plotId: f.plotId || null,
      seasonId: f.seasonId || null,
      description: f.description.trim() || null,
      currency: f.currency,
      amount: minor,
      partyId: f.partyId || null,
      tons: tons !== null && Number.isFinite(tons) && tons > 0 ? tons : null,
    });
    if (r.ok) {
      showToast(t("ui.erp.saved"));
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("ui.cost.new")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={save.error}>
      <SelectField label={t("ui.cost.category")} value={f.category} options={COST_CATEGORIES.map((x) => ({ value: x, label: t(key(`ui.cost.category_${x}`)) }))} onChange={(v) => set({ category: v })} />
      <TextField label={t("ui.cost.description")} value={f.description} onChangeText={(v) => set({ description: v })} maxLength={200} />
      <SelectField label={t("ui.common.currency")} value={f.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(v) => set({ currency: v })} />
      <TextField label={t("ui.cost.amount")} value={f.amount} onChangeText={(v) => set({ amount: v })} kind="decimal" error={errors.amount} placeholder="0" />
      {f.category === "sale" ? <TextField label={t("ui.cost.tons")} value={f.tons} onChangeText={(v) => set({ tons: v })} kind="decimal" /> : null}
      <DateField label={t("ui.cost.date")} value={f.date} onChange={(v) => set({ date: v })} error={errors.date} />
      <SelectField label={t("ui.cost.activity")} value={f.activity} options={ACTIVITIES.map((x) => ({ value: x, label: t(key(`ui.activity.${x}`)) }))} onChange={(v) => set({ activity: v })} />
      <SelectField label={t("ui.cost.farm")} value={f.farmId} options={[none, ...farms.map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => set({ farmId: v, plotId: "" })} />
      {f.farmId ? <SelectField label={t("ui.cost.plot")} value={f.plotId} options={[none, ...plots.filter((p) => p.farmId === f.farmId).map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ plotId: v })} /> : null}
      <SelectField label={t("ui.cost.season")} value={f.seasonId} options={[none, ...(seasons.data?.seasons ?? []).map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => set({ seasonId: v })} />
      <SelectField label={t("ui.cost.party")} value={f.partyId} options={[none, ...(parties.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} onChange={(v) => set({ partyId: v })} />
    </FormSheet>
  );
}
