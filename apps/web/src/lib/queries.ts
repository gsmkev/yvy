/** Consultas de TanStack Query para los datos principales de la organización (usuario, estancias, tareas, avisos, registros). Cada hook fija su clave de caché y su tiempo de vigencia. */
import { useQuery } from "@tanstack/react-query";
import { get, withQs } from "./api";
import { isPendingDelete } from "./undo";
import type { Alert, FarmDetail, FarmLine, FarmSummary, Me, Member, PlotSeason, ProblemArea, RecordRow, Season, Task } from "./types";

/** Usuario, organización y rol de la sesión actual. */
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/me"), staleTime: 60_000 });
/** Resumen de las estancias de la organización. */
export const useFarms = () => useQuery({ queryKey: ["farms"], queryFn: () => get<FarmSummary[]>("/org/farms") });
const natural = new Intl.Collator("es-PY", { numeric: true, sensitivity: "base" });
const byName = <T extends { name: string }>(a: T, b: T) => natural.compare(a.name, b.name);

/** Detalle de una estancia (lotes, puntos, capas y procesamiento de imágenes). `enabled` en false evita la consulta. */
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
/** Líneas de la estancia (alambrados, caminos y cañerías). */
export const useFarmLines = (farmId: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["lines", farmId],
    queryFn: async () => (await get<FarmLine[]>(`/org/farms/${farmId}/lines`)).filter((l) => !isPendingDelete(l.id)),
  });
/** Áreas con vigor muy por debajo de la mediana en los lotes de una estancia. */
export const useProblemAreas = (farmId: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["problem-areas", farmId],
    queryFn: () => get<ProblemArea[]>(`/org/farms/${farmId}/problem-areas`),
  });
/** Miembros de la organización con su rol. */
export const useMembers = (enabled = true) =>
  useQuery({ queryKey: ["members"], queryFn: () => get<Member[]>("/org/members"), enabled });
/** Tareas de la organización; los campos del filtro son opcionales y se combinan. */
export const useTasks = (f: { farmId?: string; assigneeId?: string; status?: string } = {}) =>
  useQuery({
    queryKey: ["tasks", f],
    queryFn: async () => (await get<Task[]>(withQs("/org/tasks", f))).filter((x) => !isPendingDelete(x.id)),
  });
/** Avisos de la organización; `active` limita a los vigentes. */
export const useAlerts = (f: { farmId?: string; active?: boolean } = {}) =>
  useQuery({
    queryKey: ["alerts", f],
    queryFn: () => get<Alert[]>(withQs("/org/alerts", { farmId: f.farmId, active: f.active ? 1 : undefined })),
  });

/** Filtros de la lista de registros; todos son opcionales. */
export interface RecordFilters {
  farmId?: string;
  plotId?: string;
  authorId?: string;
  kind?: string;
  from?: number;
  to?: number;
}
/**
 * Pide una página de registros. `cursor` es el `nextCursor` de la página anterior; `limit` es el tamaño de página.
 * @returns las filas y el cursor de la siguiente página (null si no hay más).
 */
export const fetchRecordsPage = (f: RecordFilters, cursor?: { capturedAt: number; id: string } | null, limit = 100) =>
  get<{ rows: RecordRow[]; nextCursor: { capturedAt: number; id: string } | null }>(
    withQs("/org/records", { ...f, limit, cursorAt: cursor?.capturedAt, cursorId: cursor?.id }),
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

/** Campañas de la organización y el plan por lote de una estancia. */
export const useSeasons = (farmId: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ["seasons", farmId],
    queryFn: () => get<{ seasons: Season[]; plotSeasons: PlotSeason[] }>(withQs("/org/seasons", { farmId })),
  });

/** La guía de primeros pasos se oculta por persona (en el servidor), no por navegador. */
export const useOnboarding = (enabled = true) =>
  useQuery({ queryKey: ["onboarding"], queryFn: () => get<{ dismissedAt: number | null }>("/me/onboarding"), enabled, staleTime: 5 * 60_000 });
