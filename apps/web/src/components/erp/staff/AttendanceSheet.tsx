/** Planilla de asistencia del día. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localDate } from "@yvy/shared";
import { del, get, post, withQs } from "../../../lib/api";
import { fmtIsoDate } from "../../../lib/format";
import { t } from "../../../lib/i18n";
import { fmtGs } from "../../../lib/money";
import { useFarm, useFarms } from "../../../lib/queries";
import { Button, type Column, DataTable, ErrorBox, Field, FilterBar, Input, SectionHead, Select, toast } from "../../ui";
import { ExportableTable } from "../../ExportableTable";
import { HeaderActions, RowMenu } from "../adminSlot";
import { NoStaff, type Employee } from "./employees";

interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  days: number;
  plotId: string | null;
  labor: string | null;
  wagePyg: number;
}



interface Mark {
  days: "" | "1" | "0.5";
  plotId: string;
  labor: string;
}

/** Planilla del día: por cada empleado, día completo, medio día o ausente, con el lote y la labor. */
export function AttendanceSheet({ staff: list, onGoEmployees }: { staff: Employee[]; onGoEmployees: () => void }) {
  const farms = useFarms();
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const qc = useQueryClient();
  const day = useQuery({
    queryKey: ["erp", "attendance", date],
    queryFn: () => get<Attendance[]>(withQs("/org/erp/attendance", { from: date, to: date })),
  });
  const recent = useQuery({
    queryKey: ["erp", "attendance", "recent"],
    queryFn: () => get<Attendance[]>("/org/erp/attendance"),
  });
  const marked = Object.values(marks).filter((m) => m.days).length;
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
      toast(t("ui.erp.saved"));
      setMarks({});
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/attendance/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
  if (list.length === 0) return <NoStaff onGo={onGoEmployees} />;
  const name = (id: string) => list.find((e) => e.id === id)?.name ?? "?";
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
  const set = (id: string, patch: Partial<Mark>) => setMarks({ ...marks, [id]: { days: "", plotId: "", labor: "", ...marks[id], ...patch } });
  const sheet: Column<Employee>[] = [
    { id: "name", header: t("ui.staff.name"), cell: (e) => e.name },
    {
      id: "days",
      header: t("ui.att.days"),
      cell: (e) => (
        <Select
          aria-label={`${t("ui.att.days")}: ${e.name}`}
          value={marks[e.id]?.days ?? ""}
          onChange={(ev) => set(e.id, { days: ev.target.value as Mark["days"] })}
          options={[
            { value: "", label: "—" },
            { value: "1", label: t("ui.att.full") },
            { value: "0.5", label: t("ui.att.half") },
          ]}
        />
      ),
    },
    {
      id: "plot",
      header: t("ui.cost.plot"),
      hideBelow: "md",
      cell: (e) => (
        <Select
          aria-label={`${t("ui.cost.plot")}: ${e.name}`}
          value={marks[e.id]?.plotId ?? ""}
          onChange={(ev) => set(e.id, { plotId: ev.target.value })}
          options={[{ value: "", label: t("ui.cost.none") }, ...(farm.data?.plots ?? []).map((p) => ({ value: p.id, label: p.name }))]}
        />
      ),
    },
    {
      id: "labor",
      header: t("ui.att.labor"),
      hideBelow: "md",
      cell: (e) => <Input aria-label={`${t("ui.att.labor")}: ${e.name}`} maxLength={120} value={marks[e.id]?.labor ?? ""} onChange={(ev) => set(e.id, { labor: ev.target.value })} />,
    },
    { id: "loaded", header: t("ui.att.loaded"), align: "right", cell: (e) => <span className="text-tinta-2">{loaded.get(e.id) ? `${loaded.get(e.id)} d` : ""}</span> },
  ];
  const history: Column<Attendance>[] = [
    { id: "date", header: t("ui.cost.date"), cell: (a) => fmtIsoDate(a.date) },
    { id: "name", header: t("ui.staff.name"), cell: (a) => name(a.employeeId) },
    { id: "days", header: t("ui.att.days"), align: "right", cell: (a) => (a.days === 1 ? t("ui.att.full") : t("ui.att.half")) },
    { id: "labor", header: t("ui.att.labor"), hideBelow: "md", cell: (a) => <span className="text-tinta-2">{a.labor}</span> },
    { id: "wage", header: t("ui.staff.wage"), align: "right", hideBelow: "sm", cell: (a) => fmtGs(a.wagePyg) },
    { id: "_actions", header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>, align: "right", width: "3rem", cell: (a) => <RowMenu name={fmtIsoDate(a.date)} onDelete={() => remove.mutate(a.id)} /> },
  ];
  const past = (recent.data ?? []).slice(0, 40);
  return (
    <div className="flex flex-col gap-5">
      {marked > 0 && (
        <HeaderActions>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {t("ui.att.save", { n: marked })}
          </Button>
        </HeaderActions>
      )}
      <FilterBar>
        <Field label={t("ui.cost.date")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: t("ui.cost.none") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
      </FilterBar>
      <DataTable columns={sheet} rows={list} rowKey={(e) => e.id} caption={t("ui.staff.attendance")} />
      {save.error ? <ErrorBox error={save.error} /> : null}
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title={t("ui.att.recent")} />
          <ExportableTable name="asistencia">
            <DataTable columns={history} rows={past} rowKey={(a) => a.id} />
          </ExportableTable>
        </section>
      )}
    </div>
  );
}
