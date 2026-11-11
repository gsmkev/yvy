import { useQuery } from "@tanstack/react-query";
import { get, qs } from "./api";
import { isPendingDelete } from "./undo";
import type { Alert, FarmDetail, FarmSummary, Me, Member, RecordRow, Task } from "./types";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/me"), staleTime: 60_000 });
export const useFarms = () => useQuery({ queryKey: ["farms"], queryFn: () => get<FarmSummary[]>("/org/farms") });
const natural = new Intl.Collator("es-PY", { numeric: true, sensitivity: "base" });
export const byName = <T extends { name: string }>(a: T, b: T) => natural.compare(a.name, b.name);

export const useFarm = (id: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["farm", id],
    queryFn: async () => {
      const d = await get<FarmDetail>(`/org/farms/${id}`);
      return {
        ...d,
        plots: d.plots.filter((p) => !isPendingDelete(p.id)).sort(byName),
        pois: d.pois.filter((p) => !isPendingDelete(p.id)),
      };
    },
    // Mientras se procesan las imágenes de una estancia nueva, volver a mirar cada minuto
    refetchInterval: (q) =>
      q.state.data?.imageryStatus === "pending" || q.state.data?.imageryStatus === "processing" ? 60_000 : false,
  });
export const useMembers = (enabled = true) =>
  useQuery({ queryKey: ["members"], queryFn: () => get<Member[]>("/org/members"), enabled });
export const useTasks = (f: { farmId?: string; assigneeId?: string; status?: string } = {}) =>
  useQuery({
    queryKey: ["tasks", f],
    queryFn: async () => (await get<Task[]>(`/org/tasks${qs(f)}`)).filter((x) => !isPendingDelete(x.id)),
  });
export const useAlerts = (f: { farmId?: string; active?: boolean } = {}) =>
  useQuery({
    queryKey: ["alerts", f],
    queryFn: () => get<Alert[]>(`/org/alerts${qs({ farmId: f.farmId, active: f.active ? 1 : undefined })}`),
  });

export interface RecordFilters {
  farmId?: string;
  plotId?: string;
  authorId?: string;
  kind?: string;
  from?: number;
  to?: number;
}
export const fetchRecordsPage = (f: RecordFilters, cursor?: { capturedAt: number; id: string } | null, limit = 100) =>
  get<{ rows: RecordRow[]; nextCursor: { capturedAt: number; id: string } | null }>(
    `/org/records${qs({ ...f, limit, cursorAt: cursor?.capturedAt, cursorId: cursor?.id })}`,
  );

/** Todas las páginas (para exportar), con tope. */
export async function fetchAllRecords(f: RecordFilters, max = 5000): Promise<RecordRow[]> {
  const out: RecordRow[] = [];
  let cursor: { capturedAt: number; id: string } | null = null;
  do {
    const page = await fetchRecordsPage(f, cursor, 500);
    out.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor && out.length < max);
  return out;
}
