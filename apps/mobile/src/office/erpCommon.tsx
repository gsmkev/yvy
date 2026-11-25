/** Piezas comunes de las pantallas de administración (ERP): acceso, lecturas sin caché y montos. Solo dueño y administrador (`can.manageErp`). */
import { t, toMinor, type Currency } from "@yvy/shared";
import { getSession } from "../lib/session";
import { useSyncStatus } from "../lib/sync";
import { EmptyState, Text } from "../ui/kit";
import { StatSummary } from "./ui";
import { T } from "../ui/theme";
import { OfficeScreen } from "./OfficeScreen";
import { parseDecimal } from "./format";
import { useOnline } from "./useOnline";

/** Como `can.manageErp` de la API: dueño y administrador. */
export const useManageErp = (): boolean => {
  const role = getSession()?.organization.role;
  return role === "owner" || role === "admin";
};

/** Pantalla de "no es para tu rol". */
export function NoAdminAccess({ title }: { title: string }) {
  return (
    <OfficeScreen title={title}>
      <EmptyState title={t("office.adm.noAccess")} />
    </OfficeScreen>
  );
}

/** Lectura de /org/erp/*: nunca se guarda en el celular (useOnline ya lo impide). `path: null` = no leer. */
export const useErp = <T,>(path: string | null) => useOnline<T>(path);

/** Aviso de "sin señal" para el botón de guardar; null con señal. */
export function useNoSignalReason(): string | null {
  return useSyncStatus().online ? null : t("office.needs.signalToSave");
}

/** Nota que explica por qué no se puede cargar sin señal; no muestra nada si hay señal. */
export function NoSignalNote() {
  const reason = useNoSignalReason();
  return reason ? (
    <Text accessibilityRole="alert" style={[T.smallMedium, { marginTop: 8 }]}>
      {reason}
    </Text>
  ) : null;
}

/** Monto que escribió la persona → unidad menor de `currency`; null si no es un número mayor que cero. */
export function parseMinor(text: string, currency: Currency): number | null {
  const n = parseDecimal(text);
  if (n === null || n <= 0) return null;
  return toMinor(n, currency);
}

/** "2026-11-15" → "15/11/2026". */
export const isoShort = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

/** Proveedor o cliente. */
export interface Party {
  id: string;
  name: string;
  kind: string;
}

interface SeasonLite {
  id: string;
  name: string;
}

/** Campañas de la organización (GET /org/seasons, no es del ERP). */
export const useSeasonList = () => useOnline<{ seasons: SeasonLite[] }>("/org/seasons");

/** Cifras de dinero en una tarjeta: en fila si los montos son cortos; si alguno es largo (Gs. 2.423.524.012), en 2 columnas. */
export function MoneyStats({ items }: { items: { label: string; value: string; tone?: "danger" }[] }) {
  const long = items.some((i) => i.value.length > 9);
  return <StatSummary items={items} columns={long ? 2 : undefined} />;
}
