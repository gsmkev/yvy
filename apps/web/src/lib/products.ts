/** Consulta del catálogo de productos de la organización. */
import { useQuery } from "@tanstack/react-query";
import { get } from "./api";
import type { Product } from "./types";

/** Catálogo de productos de la organización. */
export const useProducts = (enabled = true) =>
  useQuery({ enabled, queryKey: ["products"], queryFn: () => get<Product[]>("/org/products") });

/** Rango de dosis habitual de un producto, en l/ha o kg/ha según su unidad. */
export interface DoseRange {
  productId: string;
  min: number | null;
  max: number | null;
}

/** Rangos de dosis habitual de los productos de la organización. */
export const useDoseRanges = (enabled = true) =>
  useQuery({ enabled, queryKey: ["dose-ranges"], queryFn: () => get<DoseRange[]>("/org/products/dose-ranges") });
