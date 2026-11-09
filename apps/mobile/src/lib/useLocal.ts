import { useMemo } from "react";
import { useSyncStatus } from "./sync";

/** Recalcula una consulta local cada vez que cambian los datos (sync o escritura). */
export function useLocal<T>(fn: () => T, deps: unknown[] = []): T {
  const { version } = useSyncStatus();
  return useMemo(fn, [version, ...deps]);
}
