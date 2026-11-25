/** Datos de Costos: listado filtrado, campañas y baja de un movimiento. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Activity, CostCategory, Currency } from "@yvy/shared";
import { del, get, withQs } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import type { Season } from "../../../lib/types";
import { toast } from "../../ui";

/** Un movimiento de costo o venta. */
export interface CostEntry {
  id: string;
  occurredAt: number;
  farmId: string | null;
  plotId: string | null;
  seasonId: string | null;
  activity: Activity;
  category: CostCategory;
  description: string | null;
  amount: number;
  currency: Currency;
  amountPyg: number;
  tons: number | null;
  partyId: string | null;
  origin: string;
  photoPath: string | null;
}

/** Movimientos filtrados con sus totales en guaraníes. */
export interface CostList {
  rows: CostEntry[];
  totals: { costPyg: number; incomePyg: number };
}

/** Filtros de la pantalla de Costos (vacío es "todos"). */
export interface CostFilters {
  farmId: string;
  seasonId: string;
  category: string;
  from: string;
  to: string;
}

/** Filtros sin ningún valor. */
export const NO_COST_FILTERS: CostFilters = { farmId: "", seasonId: "", category: "", from: "", to: "" };

/** Campañas de la organización para elegir el centro de costo. */
export const useSeasonList = () =>
  useQuery({ queryKey: ["erp", "seasons"], queryFn: async () => (await get<{ seasons: Season[] }>("/org/seasons")).seasons });

/** Movimientos que cumplen los filtros. */
export const useCostList = (f: CostFilters) =>
  useQuery({
    queryKey: ["erp", "costs", f],
    queryFn: () =>
      get<CostList>(
        withQs("/org/erp/costs", {
          farmId: f.farmId || undefined,
          seasonId: f.seasonId || undefined,
          category: f.category || undefined,
          from: f.from || undefined,
          to: f.to || undefined,
        }),
      ),
  });

/** Borra un movimiento y llama a `onDone` al terminar. */
export function useRemoveCost(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: CostEntry) => del(`/org/erp/costs/${c.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      onDone();
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
}

/** Día ISO (AAAA-MM-DD) de una fecha en milisegundos. */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
