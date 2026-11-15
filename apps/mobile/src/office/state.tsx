/** Estados uniformes de una pantalla en línea: banner de datos viejos y los tres estados (cargando, error, vacío). */
import type { ReactNode } from "react";
import { View } from "react-native";
import { CloudOff, Clock } from "lucide-react-native";
import { t } from "@yvy/shared";
import { Button, EmptyState, Text } from "../ui/kit";
import { C, GUTTER, RADIUS, T } from "../ui/theme";
import { ageText } from "./format";
import type { OnlineResult } from "./useOnline";

/** Aviso arriba de la pantalla: "Datos de hace 2 h" o "Sin señal: mostrando lo último que bajó". No aparece si el dato es fresco. */
export function StaleBanner({ query }: { query: Pick<OnlineResult<unknown>, "data" | "stale" | "offline" | "fetchedAt"> }) {
  if (query.data === null || (!query.stale && !query.offline)) return null;
  const age = query.fetchedAt !== null ? ageText(Date.now() - query.fetchedAt) : null;
  const text = query.offline
    ? age
      ? t("office.staleOfflineAge", { age })
      : t("office.staleOffline")
    : age
      ? t("office.staleAge", { age })
      : t("office.staleOffline");
  const Icon = query.offline ? CloudOff : Clock;
  return (
    <View accessibilityRole="alert" accessibilityLabel={text} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.atencionSuave, borderRadius: RADIUS, paddingVertical: 10, paddingHorizontal: 14, marginTop: 12 }}>
      <Icon size={18} color={C.atencion} strokeWidth={2} />
      <Text style={[T.smallMedium, { color: C.atencion, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** Esqueleto simple de carga: barras grises con la forma de unas filas. */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t("ui.loading")} style={{ marginTop: 20, gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ height: 64, borderRadius: RADIUS, backgroundColor: C.linea, opacity: 0.6, marginHorizontal: i % 2 ? GUTTER / 2 : 0 }} />
      ))}
    </View>
  );
}

/**
 * Resuelve los tres estados de una pantalla en línea:
 * - cargando (sin datos todavía): esqueleto;
 * - error o sin copia: "Esto necesita señal" (o el mensaje del servidor) y Reintentar;
 * - vacío: `EmptyState` con `empty`;
 * - con datos: `children(data)`.
 * Por defecto "vacío" es un arreglo sin elementos; para otras formas pasá `isEmpty`.
 */
export function OnlineState<T>({
  query,
  empty,
  isEmpty,
  skeletonRows,
  children,
}: {
  query: OnlineResult<T>;
  empty: { title: string; hint?: string; action?: string; onAction?: () => void };
  isEmpty?: (data: T) => boolean;
  skeletonRows?: number;
  children: (data: T) => ReactNode;
}) {
  if (query.data === null) {
    if (query.loading) return <Skeleton rows={skeletonRows} />;
    return (
      <View style={{ paddingVertical: 32 }}>
        <Text style={T.heading}>{query.error && !query.offline ? query.error : t("office.needsSignal")}</Text>
        <Text style={[T.small, { marginTop: 4 }]}>{query.error && !query.offline ? t("office.loadFailed") : t("office.needsSignalHint")}</Text>
        <Button kind="secondary" title={t("office.retry")} loading={query.refreshing} onPress={() => void query.refresh()} style={{ marginTop: 16, alignSelf: "flex-start" }} />
      </View>
    );
  }
  const none = isEmpty ? isEmpty(query.data) : Array.isArray(query.data) && query.data.length === 0;
  if (none) return <EmptyState title={empty.title} hint={empty.hint} action={empty.action} onAction={empty.onAction} />;
  return <>{children(query.data)}</>;
}
