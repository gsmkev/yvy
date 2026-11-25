/** Datos del stock mínimo: mínimos cargados, faltantes y baja de un mínimo, con los nombres de producto, depósito y unidad. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { useProducts } from "../../../lib/products";
import { toast } from "../../ui";
import { useWarehouses } from "../WarehousesPanel";

/** Mínimo de un producto en un depósito. */
export interface Minimum {
  id: string;
  productId: string;
  warehouseId: string;
  minQty: number;
}

/** Producto que está bajo su mínimo en un depósito. */
export interface Low {
  productId: string;
  warehouseId: string;
  qty: number;
  minQty: number;
  missing: number;
}

/** Cómo nombrar el producto, el depósito y la unidad de una fila. */
export interface MinNames {
  prod: (id: string) => { name: string } | undefined;
  wh: (id: string) => string;
  unit: (id: string) => string;
}

/** Borra un mínimo y llama a `onDone` al terminar. */
export function useRemoveMin(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: Minimum) => del(`/org/erp/stock/minimums/${m.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      onDone();
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
}

/** Mínimos, faltantes y nombres para mostrarlos. */
export function useMinStock() {
  const products = useProducts();
  const warehouses = useWarehouses();
  const mins = useQuery({ queryKey: ["erp", "stock-minimums"], queryFn: () => get<Minimum[]>("/org/erp/stock/minimums") });
  const low = useQuery({ queryKey: ["erp", "stock-low"], queryFn: () => get<Low[]>("/org/erp/stock/low") });
  const prod = (id: string) => products.data?.find((p) => p.id === id);
  const names: MinNames = {
    prod,
    wh: (id) => warehouses.data?.find((w) => w.id === id)?.name ?? "",
    unit: (id) => tk(`fields.product.unit_${prod(id)?.unit ?? "l"}`),
  };
  const loading = mins.isLoading || products.isLoading || warehouses.isLoading;
  return { products, warehouses, mins, low, names, loading };
}
