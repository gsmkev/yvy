/**
 * Mantenimiento de máquinas (función 124): servicios por hacer (vencidos en alerta), planes y bitácora; anotar un
 * servicio o una reparación. API: GET /org/erp/maintenance/due, /maintenance/logs, /maintenance-plans, /machines;
 * POST /org/erp/maintenance/logs (apps/api/src/routes/erp/).
 */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { CURRENCIES, localDate, MAINTENANCE_KINDS, t, type Currency, type MessageKey } from "@yvy/shared";
import { showToast } from "../../../../src/lib/toast";
import { isoShort, NoAdminAccess, NoSignalNote, parseMinor, useErp, useManageErp, useNoSignalReason } from "../../../../src/office/erpCommon";
import { fmtNumber, parseDecimal } from "../../../../src/office/format";
import { fmtGs } from "../../../../src/office/money";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { OnlineState } from "../../../../src/office/state";
import { useOnlineMutation } from "../../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, Segmented, SelectField, TextField } from "../../../../src/office/ui";
import { SectionHeader, Text } from "../../../../src/ui/kit";
import { C, T } from "../../../../src/ui/theme";
import type { MaintenanceDue as Due, MaintenancePlanRow as Plan, MaintenanceLogRow as Log } from "@yvy/shared";

interface Machine {
  id: string;
  name: string;
  meterKind: "hours" | "km";
}

const unitOf = (k: "hours" | "km") => (k === "hours" ? "h" : "km");
const key = (k: string) => k as MessageKey;
type Tab = "history" | "plans";
const INVALIDATE = ["/org/erp/maintenance"];

export default function Maintenance() {
  const allowed = useManageErp();
  const [tab, setTab] = useState<Tab>("history");
  const [logging, setLogging] = useState<{ planId: string | null } | null>(null);
  const noSignal = useNoSignalReason();
  const machines = useErp<Machine[]>(allowed ? "/org/erp/machines" : null);
  const plans = useErp<Plan[]>(allowed ? "/org/erp/maintenance-plans" : null);
  const due = useErp<Due[]>(allowed ? "/org/erp/maintenance/due" : null);
  const logs = useErp<Log[]>(allowed ? "/org/erp/maintenance/logs" : null);
  if (!allowed) return <NoAdminAccess title={t("ui.admin.section_maintenance")} />;
  const machine = (id: string) => machines.data?.find((m) => m.id === id);
  const unit = (id: string) => unitOf(machine(id)?.meterKind ?? "hours");
  const dueRows = due.data ?? [];

  return (
    <OfficeScreen
      title={t("ui.admin.section_maintenance")}
      query={logs}
      onRefresh={async () => void (await Promise.all([machines.refresh(), plans.refresh(), due.refresh(), logs.refresh()]))}
      action={(machines.data ?? []).length > 0 ? { label: t("ui.maint.logNew"), icon: Plus, onPress: () => setLogging({ planId: null }), disabled: !!noSignal } : undefined}
      footer={<NoSignalNote />}
    >
      <OnlineState query={machines} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.maint.noMachinesTitle"), hint: t("ui.maint.noMachinesHint") }}>
        {() => (
          <>
            {dueRows.length > 0 ? (
              <>
                <SectionHeader title={t("ui.maint.dueTitle")} />
                <DataList
                  rows={dueRows}
                  keyOf={(d) => d.planId}
                  title={(d) => d.machine}
                  subtitle={(d) => `${d.name} · ${fmtNumber(d.meter)} / ${fmtNumber(d.dueAt)} ${unitOf(d.meterKind)}`}
                  right={(d) => (
                    <Text style={[T.smallMedium, { color: d.status === "overdue" ? C.peligro : C.atencion }]}>
                      {d.status === "overdue" ? t("ui.maint.overdue", { n: `${fmtNumber(-d.remaining)} ${unitOf(d.meterKind)}` }) : t("ui.maint.soon", { n: `${fmtNumber(d.remaining)} ${unitOf(d.meterKind)}` })}
                    </Text>
                  )}
                  onPress={(d) => setLogging({ planId: d.planId })}
                  empty={{ title: "" }}
                />
              </>
            ) : null}
            <View style={{ marginTop: 20 }}>
              <Segmented<Tab>
                options={[
                  { value: "history", label: t("ui.maint.historyTitle") },
                  { value: "plans", label: t("ui.maint.plansTitle") },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
            {tab === "history" ? (
              <DataList
                rows={logs.data ?? []}
                keyOf={(l) => l.id}
                title={(l) => machine(l.machineId)?.name ?? ""}
                subtitle={(l) => [isoShort(localDate(l.occurredAt)), t(key(`ui.maint.kind_${l.kind}`)), l.description, l.meterValue !== null ? `${fmtNumber(l.meterValue)} ${unit(l.machineId)}` : null].filter(Boolean).join(" · ")}
                right={(l) => (l.amountPyg ? fmtGs(l.amountPyg) : "")}
                empty={{ title: t("ui.maint.historyEmptyTitle"), hint: t("ui.maint.historyEmptyHint") }}
              />
            ) : (
              <DataList
                rows={plans.data ?? []}
                keyOf={(p) => p.id}
                title={(p) => p.name}
                subtitle={(p) => `${machine(p.machineId)?.name ?? ""} · ${t("ui.maint.every")} ${fmtNumber(p.everyUnits)} ${unit(p.machineId)} · ${t("ui.maint.lastDone")} ${fmtNumber(p.lastDoneMeter)} ${unit(p.machineId)}`}
                onPress={(p) => setLogging({ planId: p.id })}
                empty={{ title: t("ui.maint.plansEmptyTitle"), hint: t("ui.maint.plansEmptyHint") }}
              />
            )}
          </>
        )}
      </OnlineState>
      {logging ? <LogSheet planId={logging.planId} machines={machines.data ?? []} plans={plans.data ?? []} onClose={() => setLogging(null)} /> : null}
    </OfficeScreen>
  );
}

function LogSheet({ planId, machines, plans, onClose }: { planId: string | null; machines: Machine[]; plans: Plan[]; onClose: () => void }) {
  const plan = plans.find((p) => p.id === planId);
  const [machineId, setMachineId] = useState(plan?.machineId ?? machines[0]?.id ?? "");
  const [pid, setPid] = useState(planId ?? "");
  const [kind, setKind] = useState<string>(planId ? "preventive" : "repair");
  const [date, setDate] = useState(localDate(Date.now()));
  const [meter, setMeter] = useState("");
  const [description, setDescription] = useState(plan?.name ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("PYG");
  const [error, setError] = useState<string | null>(null);
  const save = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/maintenance/logs", { invalidate: INVALIDATE });
  const ofMachine = plans.filter((p) => p.machineId === machineId);
  const submit = async () => {
    if (!machineId) return setError(t("ui.maint.noMachinesTitle"));
    if (!date) return setError(t("office.common.invalidDate"));
    const m = meter ? parseDecimal(meter) : null;
    if (meter && (m === null || m < 0)) return setError(t("office.common.maintBadMeter"));
    const minor = amount ? parseMinor(amount, currency) : null;
    if (amount && minor === null) return setError(t("office.common.moneyNeedsAmount"));
    setError(null);
    const r = await save.mutate({
      machineId,
      planId: pid || null,
      kind,
      date,
      meterValue: m,
      description: description.trim() || null,
      amount: minor,
      currency: minor === null ? null : currency,
    });
    if (r.ok) {
      showToast(t("ui.erp.saved"));
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("ui.maint.logNew")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={error ?? save.error}>
      <SelectField label={t("ui.maint.machine")} value={machineId} options={machines.map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => (setMachineId(v), setPid(""))} />
      <SelectField label={t("ui.maint.kind")} value={kind} options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: t(key(`ui.maint.kind_${k}`)) }))} onChange={setKind} />
      <SelectField label={t("ui.maint.planName")} value={pid} options={[{ value: "", label: t("ui.maint.noPlan") }, ...ofMachine.map((p) => ({ value: p.id, label: p.name }))]} onChange={setPid} />
      <DateField label={t("ui.cost.date")} value={date} onChange={setDate} />
      <TextField label={t("ui.maint.meter")} value={meter} onChangeText={setMeter} kind="decimal" />
      <TextField label={t("ui.maint.description")} value={description} onChangeText={setDescription} maxLength={300} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 2 }}>
          <TextField label={t("ui.maint.cost")} value={amount} onChangeText={setAmount} kind="decimal" />
        </View>
        <View style={{ flex: 1.2 }}>
          <SelectField label={t("ui.common.currency")} value={currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
        </View>
      </View>
    </FormSheet>
  );
}
