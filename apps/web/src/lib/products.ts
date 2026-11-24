/** Consulta del catálogo de productos de la organización. */
import { useQuery } from "@tanstack/react-query";
import { get } from "./api";
import type { Product } from "./types";

/** Catálogo de productos de la organización. */
export const useProducts = (enabled = true) =>
  useQuery({ enabled, queryKey: ["products"], queryFn: () => get<Product[]>("/org/products") });
