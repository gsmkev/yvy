/**
 * Personal (función 133): asistencia del día (pantalla principal), saldos por persona y lista de empleados con alta.
 * La planilla y los pagos son de solo lectura: se liquidan en la web. API: GET /org/erp/employees, /attendance,
 * /employees/balance, /employees/:id/statement; POST /org/erp/attendance y /org/erp/employees (apps/api/src/routes/erp.ts).
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Check, Plus } from "lucide-react-native";
import { localDate, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../../../src/lib/db";
import { tap } from "../../../../src/lib/haptics";
import { showToast } from "../../../../src/lib/toast";
import { useLocal } from "../../../../src/lib/useLocal";
import { isoShort, NoAdminAccess, NoSignalNote, useErp, useManageErp, useNoSignalReason } from "../../../../src/office/erpCommon";
import { parseDecimal } from "../../../../src/office/format";
import { fmtGs } from "../../../../src/office/money";
import { OfficeScreen } from "../../../../src/office/OfficeScreen";
import { OnlineState } from "../../../../src/office/state";
import { useOnlineMutation } from "../../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, Segmented, SelectField, TextField } from "../../../../src/office/ui";
import { SectionHeader, Sheet, Text } from "../../../../src/ui/kit";
import { C, F, RADIUS, T } from "../../../../src/ui/theme";

interface Employee {
  id: string;
  name: string;
  ci: string | null;
  phone: string | null;
  dailyWagePyg: number;
}
interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  days: number;
  labor: string | null;
  wagePyg: number;
}
interface Balance {
  employeeId: string;
  name: string;
  days: number;
  accruedPyg: number;
  advancesPyg: number;
  paymentsPyg: number;
  balancePyg: number;
}
interface Line {
  id: string;
  date: string;
  kind: "wage" | "advance" | "payment";
  amountPyg: number;
  balancePyg: number;
  note: string | null;
}

type Tab = "attendance" | "balances" | "employees";
type Mark = "full" | "half" | "absent";
const key = (k: string) => k as MessageKey;

export default function Staff() {
  const allowed = useManageErp();
  const [tab, setTab] = useState<Tab>("attendance");
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState<Balance | null>(null);
  const noSignal = useNoSignalReason();
  const farms = useLocal(() => getDb().farms());
  const staff = useErp<Employee[]>(allowed ? "/org/erp/employees" : null);
  const day = useErp<Attendance[]>(allowed && date ? `/org/erp/attendance?from=${date}&to=${date}` : null);
  const recent = useErp<Attendance[]>(allowed && tab === "attendance" ? "/org/erp/attendance" : null);
  const balances = useErp<Balance[]>(allowed && tab === "balances" ? "/org/erp/employees/balance" : null);
  const saveDay = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/attendance", { invalidate: ["/org/erp/attendance", "/org/erp/employees"] });
  if (!allowed) return <NoAdminAccess title={t("ui.adminSection_staff")} />;

  const list = staff.data ?? [];
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
  const marked = list.filter((e) => marks[e.id] && marks[e.id] !== "absent" && (loaded.get(e.id) ?? 0) < 1);
  const nameOf = (id: string) => list.find((e) => e.id === id)?.name ?? "?";

  const save = async () => {
    const entries = marked.map((e) => ({ employeeId: e.id, days: marks[e.id] === "full" ? 1 : 0.5, farmId: farmId || undefined }));
    const r = await saveDay.mutate({ date, entries });
    if (r.ok) {
      showToast(t("ui.erpSaved"));
      setMarks({});
      void day.refresh();
      void recent.refresh();
    }
  };

  const action =
    tab === "attendance" && list.length > 0
      ? { label: t("ui.attSave", { n: marked.length }), icon: Check, onPress: () => void save(), disabled: marked.length === 0 || !date || !!noSignal, loading: saveDay.pending }
      : tab === "employees"
        ? { label: t("ui.staffAdd"), icon: Plus, onPress: () => setAdding(true), disabled: !!noSignal }
        : undefined;

  return (
    <OfficeScreen
      title={t("ui.adminSection_staff")}
      query={staff}
      onRefresh={async () => void (await Promise.all([staff.refresh(), day.refresh(), tab === "balances" ? balances.refresh() : undefined]))}
      action={action}
      footer={<NoSignalNote />}
    >
      <View style={{ marginTop: 16 }}>
        <Segmented<Tab>
          options={[
            { value: "attendance", label: t("ui.staffAttendance") },
            { value: "balances", label: t("ui.staffBalances") },
            { value: "employees", label: t("ui.staffEmployees") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === "attendance" ? (
        <OnlineState query={staff} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.staffEmptyTitle"), hint: t("ui.staffEmptyHint"), action: t("ui.staffAdd"), onAction: () => setTab("employees") }}>
          {(rows) => (
            <>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <DateField label={t("ui.costDate")} hint="" value={date} onChange={(v) => (setDate(v), setMarks({}))} />
                </View>
                <View style={{ flex: 1 }}>
                  <SelectField label={t("ui.costFarm")} value={farmId} options={[{ value: "", label: t("ui.costNone") }, ...farms.map((f) => ({ value: f.id, label: f.name }))]} onChange={setFarmId} />
                </View>
              </View>
              {rows.map((e) => (
                <AttendanceRow key={e.id} employee={e} already={loaded.get(e.id) ?? 0} mark={marks[e.id] ?? "absent"} onMark={(m) => setMarks((x) => ({ ...x, [e.id]: m }))} />
              ))}
              {saveDay.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>{saveDay.error}</Text> : null}
              {(recent.data ?? []).length > 0 ? (
                <>
                  <SectionHeader title={t("ui.attRecent")} />
                  <DataList
                    rows={(recent.data ?? []).slice(0, 8)}
                    keyOf={(a) => a.id}
                    title={(a) => nameOf(a.employeeId)}
                    subtitle={(a) => [isoShort(a.date), a.labor].filter(Boolean).join(" · ")}
                    right={(a) => (a.days === 1 ? t("ui.attFull") : t("ui.attHalf"))}
                    empty={{ title: t("ui.erpEmpty") }}
                  />
                </>
              ) : null}
            </>
          )}
        </OnlineState>
      ) : null}

      {tab === "balances" ? (
        <OnlineState query={balances} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.staffEmptyTitle"), hint: t("ui.staffEmptyHint") }}>
          {(rows) => (
            <>
              <DataList
                rows={rows}
                keyOf={(r) => r.employeeId}
                title={(r) => r.name}
                subtitle={(r) => `${r.days} ${t("ui.balDays").toLowerCase()} · ${t("ui.balAccrued")} ${fmtGs(r.accruedPyg)}`}
                right={(r) => <Text style={[T.bodyMedium, r.balancePyg < 0 && { color: C.peligro }]}>{fmtGs(r.balancePyg)}</Text>}
                onPress={setStatement}
                empty={{ title: t("ui.erpEmpty") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>{t("ui.balIntro")}</Text>
              <Text style={[T.small, { marginTop: 8 }]}>{t("office.staffWebNote")}</Text>
            </>
          )}
        </OnlineState>
      ) : null}

      {tab === "employees" ? (
        <OnlineState query={staff} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.staffEmptyTitle"), hint: t("ui.staffEmptyHint") }}>
          {(rows) => (
            <DataList rows={rows} keyOf={(e) => e.id} title={(e) => e.name} subtitle={(e) => [e.ci, e.phone].filter(Boolean).join(" · ") || undefined} right={(e) => `${fmtGs(e.dailyWagePyg)}${t("office.staffPerDay")}`} empty={{ title: t("ui.staffEmptyTitle") }} />
          )}
        </OnlineState>
      ) : null}

      {adding ? <EmployeeSheet onClose={() => setAdding(false)} onSaved={() => void staff.refresh()} /> : null}
      {statement ? <StatementSheet row={statement} onClose={() => setStatement(null)} /> : null}
    </OfficeScreen>
  );
}

/** Un empleado y sus tres opciones del día: presente, medio día o ausente. */
function AttendanceRow({ employee: e, already, mark, onMark }: { employee: Employee; already: number; mark: Mark; onMark: (m: Mark) => void }) {
  const opts: { value: Mark; label: string }[] = [
    { value: "full", label: t("office.attPresent") },
    { value: "half", label: t("office.attHalfShort") },
    { value: "absent", label: t("office.attAbsent") },
  ];
  const full = already >= 1;
  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: RADIUS, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco }}>
      <Text style={T.bodyMedium}>{e.name}</Text>
      {already > 0 ? <Text style={[T.small, { color: C.accionOscuro }]}>{`${t("ui.attLoaded")}: ${already === 1 ? t("ui.attFull") : t("ui.attHalf")}`}</Text> : null}
      {full ? null : (
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {opts.map((o) => {
            const on = o.value === mark;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${e.name}: ${o.label}`}
                onPress={() => (tap(), onMark(o.value))}
                style={{ flex: 1, minHeight: 48, borderRadius: RADIUS, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: on ? (o.value === "absent" ? C.tinta2 : C.accion) : C.blanco, borderColor: on ? (o.value === "absent" ? C.tinta2 : C.accion) : C.lineaFuerte }}
              >
                <Text numberOfLines={1} style={{ fontFamily: F.sansMedium, fontSize: 16, color: on ? C.blanco : C.tinta }}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function StatementSheet({ row, onClose }: { row: Balance; onClose: () => void }) {
  const q = useErp<Line[]>(`/org/erp/employees/${row.employeeId}/statement`);
  return (
    <Sheet visible title={`${t("ui.balStatement")}: ${row.name}`} onClose={onClose}>
      <OnlineState query={q} skeletonRows={3} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.erpEmpty") }}>
        {(rows) => (
          <DataList
            rows={rows.slice(0, 40)}
            keyOf={(l) => l.id}
            title={(l) => `${t(key(`ui.balKind_${l.kind}`))}${l.note ? `: ${l.note}` : ""}`}
            subtitle={(l) => `${isoShort(l.date)} · ${t("ui.balBalance")} ${fmtGs(l.balancePyg)}`}
            right={(l) => fmtGs(l.amountPyg)}
            empty={{ title: t("ui.erpEmpty") }}
          />
        )}
      </OnlineState>
    </Sheet>
  );
}

function EmployeeSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", ci: "", phone: "", wage: "" });
  const [errors, setErrors] = useState<{ name?: string; wage?: string }>({});
  const save = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/employees", { invalidate: ["/org/erp/employees"] });
  const submit = async () => {
    const wage = parseDecimal(f.wage);
    const e: typeof errors = {};
    if (!f.name.trim()) e.name = t("office.staffNeedsName");
    if (wage === null || wage < 0) e.wage = t("office.moneyNeedsAmount");
    setErrors(e);
    if (Object.keys(e).length || wage === null) return;
    const r = await save.mutate({ name: f.name.trim(), ci: f.ci.trim() || null, phone: f.phone.trim() || null, dailyWagePyg: Math.round(wage) });
    if (r.ok) {
      showToast(t("ui.erpSaved"));
      onSaved();
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("ui.staffAdd")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.save")} pending={save.pending} error={save.error}>
      <TextField label={t("ui.staffName")} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} error={errors.name} />
      <TextField label={t("ui.staffCi")} value={f.ci} onChangeText={(v) => setF({ ...f, ci: v })} maxLength={30} />
      <TextField label={t("ui.staffPhone")} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} maxLength={40} />
      <TextField label={t("ui.staffWage")} value={f.wage} onChangeText={(v) => setF({ ...f, wage: v })} kind="number" error={errors.wage} />
    </FormSheet>
  );
}
