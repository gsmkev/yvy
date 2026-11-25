/**
 * Personal: asistencia del día (pantalla principal), saldos por persona y lista de empleados con alta.
 * La planilla y los pagos son de solo lectura: se liquidan en la web. API: GET /org/erp/employees, /attendance,
 * /employees/balance, /employees/:id/statement; POST /org/erp/attendance y /org/erp/employees (apps/api/src/routes/erp/).
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Check, Plus } from "lucide-react-native";
import { localDate, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../../../src/lib/db";
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

/** Asistencia del día: fecha, estancia, marcas por empleado y lo ya cargado; `save` envía solo lo marcado y sin cargar. */
function useAttendance(allowed: boolean, tab: Tab, list: Employee[]) {
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const day = useErp<Attendance[]>(allowed && date ? `/org/erp/attendance?from=${date}&to=${date}` : null);
  const recent = useErp<Attendance[]>(allowed && tab === "attendance" ? "/org/erp/attendance" : null);
  const mutation = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/erp/attendance", { invalidate: ["/org/erp/attendance", "/org/erp/employees"] });
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
  const marked = list.filter((e) => marks[e.id] && marks[e.id] !== "absent" && (loaded.get(e.id) ?? 0) < 1);
  const save = async () => {
    const entries = marked.map((e) => ({ employeeId: e.id, days: marks[e.id] === "full" ? 1 : 0.5, farmId: farmId || undefined }));
    const r = await mutation.mutate({ date, entries });
    if (r.ok) {
      showToast(t("ui.erp.saved"));
      setMarks({});
      void day.refresh();
      void recent.refresh();
    }
  };
  const pickDate = (v: string) => {
    setDate(v);
    setMarks({});
  };
  return { date, pickDate, farmId, setFarmId, marks, mark: (id: string, m: Mark) => setMarks((x) => ({ ...x, [id]: m })), loaded, marked, save, day, recent, mutation };
}

/** Botón fijo de cada pestaña: guardar la asistencia o dar de alta un empleado. */
function tabAction(tab: Tab, o: { att: ReturnType<typeof useAttendance>; hasStaff: boolean; blocked: boolean; add: () => void }) {
  if (tab === "attendance" && o.hasStaff) {
    const { marked, date, mutation, save } = o.att;
    return { label: t("ui.att.save", { n: marked.length }), icon: Check, onPress: () => void save(), disabled: marked.length === 0 || !date || o.blocked, loading: mutation.pending };
  }
  return tab === "employees" ? { label: t("ui.staff.add"), icon: Plus, onPress: o.add, disabled: o.blocked } : undefined;
}

/** Personal: asistencia, saldos y empleados. */
export default function Staff() {
  const allowed = useManageErp();
  const [tab, setTab] = useState<Tab>("attendance");
  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState<Balance | null>(null);
  const noSignal = useNoSignalReason();
  const staff = useErp<Employee[]>(allowed ? "/org/erp/employees" : null);
  const balances = useErp<Balance[]>(allowed && tab === "balances" ? "/org/erp/employees/balance" : null);
  const list = staff.data ?? [];
  const att = useAttendance(allowed, tab, list);
  if (!allowed) return <NoAdminAccess title={t("ui.admin.section_staff")} />;
  const emptyStaff = { title: t("ui.staff.emptyTitle"), hint: t("ui.staff.emptyHint"), action: t("ui.staff.add"), onAction: () => setTab("employees") };

  return (
    <OfficeScreen
      title={t("ui.admin.section_staff")}
      query={staff}
      onRefresh={async () => void (await Promise.all([staff.refresh(), att.day.refresh(), tab === "balances" ? balances.refresh() : undefined]))}
      action={tabAction(tab, { att, hasStaff: list.length > 0, blocked: !!noSignal, add: () => setAdding(true) })}
      footer={<NoSignalNote />}
    >
      <View style={{ marginTop: 16 }}>
        <Segmented<Tab>
          options={[
            { value: "attendance", label: t("ui.staff.attendance") },
            { value: "balances", label: t("ui.staff.balances") },
            { value: "employees", label: t("ui.staff.employees") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "attendance" ? (
        <OnlineState query={staff} isEmpty={(d) => d.length === 0} empty={emptyStaff}>
          {(rows) => <AttendanceTab rows={rows} att={att} />}
        </OnlineState>
      ) : null}
      {tab === "balances" ? (
        <OnlineState query={balances} isEmpty={(d) => d.length === 0} empty={emptyStaff}>
          {(rows) => (
            <>
              <DataList rows={rows} keyOf={(r) => r.employeeId} title={(r) => r.name} subtitle={(r) => `${r.days} ${t("ui.bal.days").toLowerCase()}, ${t("ui.bal.accrued")} ${fmtGs(r.accruedPyg)}`} right={(r) => <Text style={[T.bodyMedium, r.balancePyg < 0 && { color: C.peligro }]}>{fmtGs(r.balancePyg)}</Text>} onPress={setStatement} empty={{ title: t("ui.erp.empty") }} />
              <Text style={[T.small, { marginTop: 16 }]}>{t("office.staff.webNote")}</Text>
            </>
          )}
        </OnlineState>
      ) : null}
      {tab === "employees" ? (
        <OnlineState query={staff} isEmpty={(d) => d.length === 0} empty={{ ...emptyStaff, onAction: () => setAdding(true) }}>
          {(rows) => <DataList rows={rows} keyOf={(e) => e.id} title={(e) => e.name} subtitle={(e) => [e.ci, e.phone].filter(Boolean).join(", ") || undefined} right={(e) => `${fmtGs(e.dailyWagePyg)}${t("office.staff.perDay")}`} empty={emptyStaff} />}
        </OnlineState>
      ) : null}
      {adding ? <EmployeeSheet onClose={() => setAdding(false)} onSaved={() => void staff.refresh()} /> : null}
      {statement ? <StatementSheet row={statement} onClose={() => setStatement(null)} /> : null}
    </OfficeScreen>
  );
}

/** Pestaña de asistencia: filtros del día, una tarjeta por empleado y las últimas cargas. */
function AttendanceTab({ rows, att }: { rows: Employee[]; att: ReturnType<typeof useAttendance> }) {
  const farms = useLocal(() => getDb().farms());
  const recent = (att.recent.data ?? []).slice(0, 8);
  const nameOf = (id: string) => rows.find((e) => e.id === id)?.name ?? "?";
  return (
    <>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <DateField label={t("ui.cost.date")} hint="" value={att.date} onChange={att.pickDate} />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField label={t("ui.cost.farm")} value={att.farmId} options={[{ value: "", label: t("ui.cost.none") }, ...farms.map((f) => ({ value: f.id, label: f.name }))]} onChange={att.setFarmId} />
        </View>
      </View>
      {rows.map((e) => (
        <AttendanceRow key={e.id} employee={e} already={att.loaded.get(e.id) ?? 0} mark={att.marks[e.id]} onMark={(m) => att.mark(e.id, m)} />
      ))}
      {att.mutation.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>{att.mutation.error}</Text> : null}
      {recent.length > 0 ? (
        <>
          <SectionHeader title={t("ui.att.recent")} />
          <DataList rows={recent} keyOf={(a) => a.id} title={(a) => nameOf(a.employeeId)} subtitle={(a) => [isoShort(a.date), a.labor].filter(Boolean).join(", ")} right={(a) => (a.days === 1 ? t("ui.att.full") : t("ui.att.half"))} empty={{ title: t("ui.erp.empty") }} />
        </>
      ) : null}
    </>
  );
}

/** Un empleado y sus tres opciones del día: presente, medio día o ausente. */
function AttendanceRow({ employee: e, already, mark, onMark }: { employee: Employee; already: number; mark?: Mark; onMark: (m: Mark) => void }) {
  const opts: { value: Mark; label: string }[] = [
    { value: "full", label: t("office.att.present") },
    { value: "half", label: t("office.att.halfShort") },
    { value: "absent", label: t("office.att.absent") },
  ];
  const full = already >= 1;
  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: RADIUS, borderWidth: 1, borderColor: C.linea, backgroundColor: C.blanco }}>
      <Text style={T.bodyMedium}>{e.name}</Text>
      {already > 0 ? <Text style={[T.small, { color: C.accionOscuro }]}>{`${t("ui.att.loaded")}: ${already === 1 ? t("ui.att.full") : t("ui.att.half")}`}</Text> : null}
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
                onPress={() => onMark(o.value)}
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
    <Sheet visible title={`${t("ui.bal.statement")}: ${row.name}`} onClose={onClose}>
      <OnlineState query={q} skeletonRows={3} isEmpty={(d) => d.length === 0} empty={{ title: t("ui.erp.empty") }}>
        {(rows) => (
          <DataList
            rows={rows.slice(0, 40)}
            keyOf={(l) => l.id}
            title={(l) => `${t(key(`ui.bal.kind_${l.kind}`))}${l.note ? `: ${l.note}` : ""}`}
            subtitle={(l) => `${isoShort(l.date)}, ${t("ui.bal.balance")} ${fmtGs(l.balancePyg)}`}
            right={(l) => fmtGs(l.amountPyg)}
            empty={{ title: t("ui.erp.empty") }}
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
    if (!f.name.trim()) e.name = t("office.staff.needsName");
    if (wage === null || wage < 0) e.wage = t("office.common.moneyNeedsAmount");
    setErrors(e);
    if (Object.keys(e).length || wage === null) return;
    const r = await save.mutate({ name: f.name.trim(), ci: f.ci.trim() || null, phone: f.phone.trim() || null, dailyWagePyg: Math.round(wage) });
    if (r.ok) {
      showToast(t("ui.erp.saved"));
      onSaved();
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("ui.staff.add")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={save.error}>
      <TextField label={t("ui.staff.name")} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} error={errors.name} />
      <TextField label={t("ui.staff.ci")} value={f.ci} onChangeText={(v) => setF({ ...f, ci: v })} maxLength={30} />
      <TextField label={t("ui.staff.phone")} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} maxLength={40} />
      <TextField label={t("ui.staff.wage")} value={f.wage} onChangeText={(v) => setF({ ...f, wage: v })} kind="number" error={errors.wage} />
    </FormSheet>
  );
}
