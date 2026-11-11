/**
 * Estancia elegida (F-20). Solo hay selector si el usuario tiene lotes en más de una estancia;
 * con una sola no se muestra nada y todo se ve completo.
 */
import type { LocalDb } from "../db/store";
import { byFarm, resolveFarmChoice, type FarmChoice } from "./farmChoice";
import { getDb } from "./db";
import { localChanged } from "./sync";
import { useLocal } from "./useLocal";

export { byFarm, resolveFarmChoice, type FarmChoice };

export const SELECTED_FARM_KEY = "selected_farm_id";

export const farmChoice = (db: LocalDb = getDb()): FarmChoice => resolveFarmChoice(db.farms(), db.plots(), db.getKv(SELECTED_FARM_KEY));

/** Id de la estancia que filtra, o null si se ve todo. */
export const selectedFarmId = (db: LocalDb = getDb()): string | null => farmChoice(db).current?.id ?? null;

export function setSelectedFarm(id: string): void {
  getDb().setKv(SELECTED_FARM_KEY, id);
  localChanged();
}

export function useFarmChoice(): FarmChoice & { farmId: string | null } {
  const c = useLocal(() => farmChoice());
  return { ...c, farmId: c.current?.id ?? null };
}
