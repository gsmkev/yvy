/** Datos del inventario: existencias, movimientos del producto elegido, lotes por vencer y baja de un movimiento. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, withQs } from "../../../lib/api";
import { t, tk } from "../../../lib/i18n";
import { useProducts } from "../../../lib/products";
import { toast } from "../../ui";
import { useWarehouses } from "../WarehousesPanel";
import type { StockLookup } from "./columns";
import type { ExpiringLot, StockMove, Summary } from "./types";

/** Borra un movimiento y llama a `onDone` al terminar. */
export function useRemoveMove(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: StockMove) => del(`/org/erp/stock/moves/${m.id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      onDone();
      qc.invalidateQueries({ queryKey: ["erp"] });
    },
  });
}

/** Existencias, movimientos de `productId` (todos si está vacío) y lotes por vencer, con los nombres de productos y depósitos. */
export function useStockData(productId: string) {
  const stock = useQuery({ queryKey: ["erp", "stock"], queryFn: () => get<Summary>("/org/erp/stock") });
  const products = useProducts();
  const warehouses = useWarehouses();
  const moves = useQuery({
    queryKey: ["erp", "stock-moves", productId],
    queryFn: () => get<StockMove[]>(withQs("/org/erp/stock/moves", { productId: productId || undefined })),
  });
  const expiring = useQuery({ queryKey: ["erp", "expiring"], queryFn: () => get<ExpiringLot[]>("/org/erp/stock/expiring") });
  const lookup: StockLookup = {
    prod: (id) => products.data?.find((p) => p.id === id),
    wh: (id) => warehouses.data?.find((w) => w.id === id)?.name ?? "",
    unit: (id) => tk(`fields.product.unit_${products.data?.find((p) => p.id === id)?.unit ?? "l"}`),
  };
  const loading = stock.isLoading || products.isLoading || warehouses.isLoading;
  return { stock, products, warehouses, moves, expiring, lookup, loading };
}
