import { useQuery } from "@tanstack/react-query";
import { get } from "./api";
import type { Product } from "./types";

export const useProducts = (enabled = true) =>
  useQuery({ enabled, queryKey: ["products"], queryFn: () => get<Product[]>("/org/products") });
