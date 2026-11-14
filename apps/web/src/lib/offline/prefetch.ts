/**
 * "Guardar esta estancia": además de los mapas, deja en la copia de lecturas lo que se mira de una estancia
 * (lotes y puntos, tareas, primera página de registros). Cada consulta usa las mismas opciones que la pantalla.
 */
import type { QueryClient } from "@tanstack/react-query";
import { farmQuery, recordsQuery, tasksQuery } from "../queries";

export async function prefetchFarmForOffline(qc: QueryClient, farmId: string): Promise<void> {
  const quiet = (p: Promise<unknown>) => p.catch(() => {});
  await Promise.all([
    quiet(qc.prefetchQuery({ ...farmQuery(farmId), staleTime: 0 })),
    quiet(qc.prefetchQuery({ ...tasksQuery({ farmId }), staleTime: 0 })),
    quiet(qc.prefetchInfiniteQuery({ ...recordsQuery({ farmId }), staleTime: 0 })),
  ]);
}
