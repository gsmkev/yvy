/** Personal: empleados con su jornal y asistencia diaria con lote y labor (E-25). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localDate } from "@yvy/shared";
import { del, get, post, qs } from "../../lib/api";
import { fmtIsoDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarm, useFarms } from "../../lib/queries";
import { Button, Empty, ErrorBox, Field, Input, Select, Spinner, Tabs, toast } from "../ui";
import { MasterPanel, useErpList, type FieldDef } from "./MasterPanel";

export interface Employee {
  id: string;
  name: string;
  ci: string | null;
  phone: string | null;
  dailyWagePyg: number;
}
export const useEmployees = () => useErpList<Employee>("employees");

interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  days: number;
  plotId: string | null;
  labor: string | null;
  wagePyg: number;
}



export function StaffPanel({ extra }: { extra?: { id: string; label: string; render: () => React.ReactNode }[] }) {
  const [tab, setTab] = useState<string>("attendance");
  const tabs = [
    { id: "attendance", label: t("ui.staffAttendance") },
    { id: "employees", label: t("ui.staffEmployees") },
    ...(extra ?? []).map((x) => ({ id: x.id, label: x.label })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <Tabs<string> tabs={tabs} value={tab} onChange={setTab} />
      {tab === "attendance" && <AttendanceSheet />}
      {tab === "employees" && <EmployeesList />}
      {extra?.find((x) => x.id === tab)?.render()}
    </div>
  );
}

function EmployeesList() {
  const fields: FieldDef[] = [
    { key: "name", label: t("ui.staffName"), required: true, maxLength: 120 },
    { key: "ci", label: t("ui.staffCi"), maxLength: 30 },
    { key: "phone", label: t("ui.staffPhone"), maxLength: 40 },
    { key: "dailyWagePyg", label: t("ui.staffWage"), type: "number", required: true, min: 0, step: "1" },
  ];
  return (
    <MasterPanel<Employee>
      path="employees"
      intro={t("ui.staffIntro")}
      newLabel={t("ui.staffNew")}
      name={(e) => e.name}
      fields={fields}
      columns={[
        { header: t("ui.staffName"), cell: (e) => <span className="font-medium">{e.name}</span> },
        { header: t("ui.staffCi"), cell: (e) => e.ci ?? "" },
        { header: t("ui.staffWage"), right: true, cell: (e) => fmtGs(e.dailyWagePyg) },
      ]}
    />
  );
}

interface Mark {
  days: "" | "1" | "0.5";
  plotId: string;
  labor: string;
}

/** Planilla del día: por cada empleado, día completo, medio día o ausente, con el lote y la labor. */
function AttendanceSheet() {
  const staff = useEmployees();
  const farms = useFarms();
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const qc = useQueryClient();
  const day = useQuery({ queryKey: ["erp", "attendance", date], queryFn: () => get<Attendance[]>(`/org/erp/attendance${qs({ from: date, to: date })}`) });
  const recent = useQuery({ queryKey: ["erp", "attendance", "recent"], queryFn: () => get<Attendance[]>("/org/erp/attendance") });
  const save = useMutation({
    mutationFn: () => {
      const entries = Object.entries(marks)
        .filter(([, m]) => m.days)
        .map(([employeeId, m]) => ({
          employeeId,
          days: Number(m.days),
          farmId: m.plotId ? undefined : farmId || undefined,
          plotId: m.plotId || undefined,
          labor: m.labor || undefined,
        }));
      return post("/org/erp/attendance", { date, entries });
    },
    onSuccess: () => {
      toast(t("ui.erpSaved"));
      setMarks({});
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/attendance/${id}`),
    onSuccess: () => {
      toast(t("ui.erpDeleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (staff.isLoading) return <Spinner />;
  if (staff.error) return <ErrorBox error={staff.error} />;
  const list = staff.data ?? [];
  const name = (id: string) => list.find((e) => e.id === id)?.name ?? "?";
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
  const set = (id: string, patch: Partial<Mark>) => setMarks({ ...marks, [id]: { days: "", plotId: "", labor: "", ...marks[id], ...patch } });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">{t("ui.attIntro")}</p>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Field label={t("ui.costDate")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: t("ui.costNone") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
      </div>
      {list.length === 0 ? (
        <Empty>{t("ui.attNoStaff")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-tinta-2">
                <th className="py-2 pr-4 font-medium">{t("ui.staffName")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.attDays")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.costPlot")}</th>
                <th className="py-2 pr-4 font-medium">{t("ui.attLabor")}</th>
                <th className="py-2 text-right font-medium">{t("ui.attLoaded")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b border-linea">
                  <td className="py-2 pr-4 font-medium">{e.name}</td>
                  <td className="py-2 pr-4">
                    <Select
                      value={marks[e.id]?.days ?? ""}
                      onChange={(ev) => set(e.id, { days: ev.target.value as Mark["days"] })}
                      options={[
                        { value: "", label: "—" },
                        { value: "1", label: t("ui.attFull") },
                        { value: "0.5", label: t("ui.attHalf") },
                      ]}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Select
                      value={marks[e.id]?.plotId ?? ""}
                      onChange={(ev) => set(e.id, { plotId: ev.target.value })}
                      options={[{ value: "", label: t("ui.costNone") }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Input maxLength={120} value={marks[e.id]?.labor ?? ""} onChange={(ev) => set(e.id, { labor: ev.target.value })} />
                  </td>
                  <td className="num py-2 text-right text-tinta-2">{loaded.get(e.id) ? `${loaded.get(e.id)} d` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}
      <div>
        <Button variant="primary" disabled={save.isPending || !Object.values(marks).some((m) => m.days)} onClick={() => save.mutate()}>
          {t("ui.save")}
        </Button>
      </div>
      <h2 className="border-b border-linea pb-2 font-serif text-lg font-semibold">{t("ui.attRecent")}</h2>
      {(recent.data ?? []).length === 0 ? (
        <Empty>{t("ui.erpEmpty")}</Empty>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {(recent.data ?? []).slice(0, 40).map((a) => (
              <tr key={a.id} className="border-b border-linea">
                <td className="num py-2.5 pr-4">{fmtIsoDate(a.date)}</td>
                <td className="py-2.5 pr-4 font-medium">{name(a.employeeId)}</td>
                <td className="num py-2.5 pr-4 text-right">{a.days === 1 ? t("ui.attFull") : t("ui.attHalf")}</td>
                <td className="py-2.5 pr-4 text-tinta-2">{a.labor}</td>
                <td className="num py-2.5 pr-4 text-right">{fmtGs(a.wagePyg)}</td>
                <td className="py-2.5 text-right">
                  <button className="cursor-pointer text-tinta-2 underline-offset-4 hover:text-peligro hover:underline" onClick={() => remove.mutate(a.id)}>
                    {t("ui.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
