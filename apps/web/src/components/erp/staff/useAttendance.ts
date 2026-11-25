/** Datos de la planilla: asistencia del día y reciente, y guardado y baja de marcas. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post, withQs } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { toast } from "../../ui";
import type { Attendance, Mark } from "./attendanceColumns";

/** Asistencia de `date`, las últimas cargadas y las acciones de guardar `marks` y borrar una. */
export function useAttendance(date: string, farmId: string) {
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const day = useQuery({ queryKey: ["erp", "attendance", date], queryFn: () => get<Attendance[]>(withQs("/org/erp/attendance", { from: date, to: date })) });
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
  const set = (id: string, patch: Partial<Mark>) => setMarks({ ...marks, [id]: { days: "", plotId: "", labor: "", ...marks[id], ...patch } });
  const marked = Object.values(marks).filter((m) => m.days).length;
  return { marks, set, marked, day, recent, save, remove };
}
