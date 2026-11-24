/** Piezas de Administración de Compras, Stock y maestros: permisos como `can` de la API, listas de apoyo y la hoja de alta/edición. */
import { useMemo, type ReactNode } from "react";
import { localDate, t, type Currency, type MessageKey } from "@yvy/shared";
import type { Product } from "../db/store";
import { getDb } from "../lib/db";
import { getSession } from "../lib/session";
import { useLocal } from "../lib/useLocal";
import { EmptyState, Text } from "../ui/kit";
import { C, F } from "../ui/theme";
import { compactMoney } from "./adminMoney";
import { OfficeScreen } from "./OfficeScreen";
import { useOnline } from "./useOnline";

export { compactMoney };
export const k = (s: string) => s as MessageKey;
export const today = () => localDate(Date.now());

/** Mismos permisos que `can.manageErp` y `can.viewStock` de la API. */
export function useAdminAccess(): { manage: boolean; stock: boolean } {
  const role = getSession()?.organization.role;
  const manage = role === "owner" || role === "admin";
  return { manage, stock: manage || role === "agronomist" };
}

/** Deja pasar solo a quien la API deja (`need`); a los demás les muestra el motivo. */
export function AdminGate({ need, title, children }: { need: "manage" | "stock"; title: string; children: ReactNode }) {
  const a = useAdminAccess();
  if (!a[need]) {
    return (
      <OfficeScreen title={title}>
        <EmptyState title={t("office.adm.gateTitle")} hint={t(need === "manage" ? "office.adm.gateManage" : "office.adm.gateStock")} />
      </OfficeScreen>
    );
  }
  return <>{children}</>;
}

export interface Party {
  id: string;
  name: string;
  ruc: string | null;
  kind: "supplier" | "customer" | "both";
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
}

export interface WarehouseRow {
  id: string;
  farmId: string;
  name: string;
  type: "shed" | "tank" | "silo";
  isDefault: boolean;
}

/** Proveedores y clientes (solo dueño y administrador: la API se lo niega al agrónomo, así que no se pide). */
export const useParties = (enabled = true) => useOnline<Party[]>(enabled ? "/org/erp/parties" : null);

/** Depósitos (los ve también el agrónomo). */
export const useWarehouses = () => useOnline<WarehouseRow[]>("/org/erp/warehouses");

/** Productos del catálogo: están en el celular (sincronizados), sin montos. */
export function useProductMap(): { products: Product[]; byId: Map<string, Product> } {
  const products = useLocal(() => getDb().products());
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  return { products, byId };
}

/** Estancias del celular. */
export function useFarmNames(): Map<string, string> {
  const farms = useLocal(() => getDb().farms());
  return useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);
}

export const unitOf = (p: Product | undefined): string => (p ? (p.unit === "kg" ? "kg" : "l") : "");

export const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: "PYG", label: "Gs." },
  { value: "USD", label: "US$" },
];

/** Valor a la derecha de una fila, con el mismo estilo que `DataList`. */
export function RightText({ children }: { children: string }) {
  return <Text style={{ fontFamily: F.sansMedium, fontSize: 17, color: C.tinta }}>{children}</Text>;
}
