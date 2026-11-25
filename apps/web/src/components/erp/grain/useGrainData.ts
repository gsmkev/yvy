/** Datos de la venta de granos: contratos con su avance, entregas, liquidaciones y sus bajas. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Currency, GrainDeliveryRow } from "@yvy/shared";
import { del, get } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { toast } from "../../ui";

/** Contrato de venta con lo entregado y liquidado hasta hoy. */
export interface Contract {
  id: string;
  partyId: string | null;
  number: string | null;
  crop: string;
  tons: number;
  priceMinor: number;
  currency: Currency;
  deliveredTons: number;
  toDeliverTons: number;
  settledTons: number;
  toSettleTons: number;
  settledAmount: number;
}

/** Liquidación de un contrato. */
export interface Settlement {
  id: string;
  contractId: string;
  date: string;
  tons: number;
  netAmount: number;
  netPyg: number;
  currency: Currency;
  dueDate: string | null;
  paidAmount: number;
  number: string | null;
}

/** Entrega de granos con su ticket de balanza. */
export type Delivery = GrainDeliveryRow;

function useRemoveFrom(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/org/erp/${path}/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
}

/** Contratos, entregas y liquidaciones de la organización, con las bajas de entregas y liquidaciones. */
export function useGrainData() {
  const contracts = useQuery({ queryKey: ["erp", "grain-contracts-summary"], queryFn: () => get<Contract[]>("/org/erp/grain-contracts/summary") });
  const deliveries = useQuery({ queryKey: ["erp", "grain-deliveries"], queryFn: () => get<Delivery[]>("/org/erp/grain-deliveries") });
  const settlements = useQuery({ queryKey: ["erp", "grain-settlements"], queryFn: () => get<Settlement[]>("/org/erp/grain-settlements") });
  const removeDelivery = useRemoveFrom("grain-deliveries");
  const removeSettlement = useRemoveFrom("grain-settlements");
  return { contracts, deliveries, settlements, removeDelivery, removeSettlement };
}
