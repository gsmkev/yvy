/** Estancia elegida para una pantalla de informes: viene en `?farmId=`, o la primera; con varias, chips para cambiar. */
import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { Farm } from "../db/store";
import { getDb } from "../lib/db";
import { useLocal } from "../lib/useLocal";
import { FilterChips } from "./ui";

export function useFarmPick(): { farms: Farm[]; farm: Farm | null; setFarmId: (id: string) => void } {
  const { farmId } = useLocalSearchParams<{ farmId?: string }>();
  const farms = useLocal(() => getDb().farms());
  const [picked, setPicked] = useState<string | null>(null);
  const want = picked ?? farmId ?? null;
  const farm = farms.find((f) => f.id === want) ?? farms[0] ?? null;
  return { farms, farm, setFarmId: setPicked };
}

/** Chips de estancia; no se muestran con una sola. */
export function FarmChips({ farms, value, onChange }: { farms: Farm[]; value: string | undefined; onChange: (id: string) => void }) {
  if (farms.length < 2 || !value) return null;
  return <FilterChips value={value} onChange={onChange} options={farms.map((f) => ({ value: f.id, label: f.name }))} />;
}
