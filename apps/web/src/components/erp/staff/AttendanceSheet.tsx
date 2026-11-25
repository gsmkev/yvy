/** Planilla de asistencia del día. */
import { useState } from "react";
import { localDate } from "@yvy/shared";
import { t } from "../../../lib/i18n";
import { useFarm, useFarms } from "../../../lib/queries";
import { Button, DataTable, ErrorBox, Field, FilterBar, Input, SectionHead, Select } from "../../ui";
import { ExportableTable } from "../../ExportableTable";
import { HeaderActions } from "../adminSlot";
import { historyColumns, sheetColumns } from "./attendanceColumns";
import { NoStaff, type Employee } from "./employees";
import { useAttendance } from "./useAttendance";

/** Planilla del día: por cada empleado, día completo, medio día o ausente, con el lote y la labor. */
export function AttendanceSheet({ staff: list, onGoEmployees }: { staff: Employee[]; onGoEmployees: () => void }) {
  const farms = useFarms();
  const [date, setDate] = useState(localDate(Date.now()));
  const [farmId, setFarmId] = useState("");
  const farm = useFarm(farmId, !!farmId);
  const { marks, set, marked, day, recent, save, remove } = useAttendance(date, farmId);
  if (list.length === 0) return <NoStaff onGo={onGoEmployees} />;
  const name = (id: string) => list.find((e) => e.id === id)?.name ?? "?";
  const loaded = new Map<string, number>();
  for (const a of day.data ?? []) loaded.set(a.employeeId, (loaded.get(a.employeeId) ?? 0) + a.days);
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
      <FilterBar sheet={false} exportSlot={false}>
        <Field label={t("ui.cost.date")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("ui.cost.farm")}>
          <Select value={farmId} onChange={(e) => setFarmId(e.target.value)} options={[{ value: "", label: t("ui.cost.none") }, ...(farms.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
      </FilterBar>
      <DataTable columns={sheetColumns({ marks, plots: farm.data?.plots ?? [], loaded, set })} rows={list} rowKey={(e) => e.id} caption={t("ui.staff.attendance")} />
      {save.error ? <ErrorBox error={save.error} /> : null}
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead title={t("ui.att.recent")} />
          <ExportableTable name="asistencia">
            <DataTable columns={historyColumns(name, remove.mutate)} rows={past} rowKey={(a) => a.id} />
          </ExportableTable>
        </section>
      )}
    </div>
  );
}
