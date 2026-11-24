/** Marco de las pantallas de oficina: título, aviso de datos viejos, pull-to-refresh y acción primaria fija abajo. */
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, s as k, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { StaleBanner } from "./state";
import type { OnlineResult } from "./useOnline";

interface OfficeScreenProps {
  title: string;
  subtitle?: string;
  /** Acción primaria (una por pantalla), fija abajo. */
  action?: { label: string; onPress: () => void; icon?: LucideIcon; disabled?: boolean; loading?: boolean };
  /** Resultado de useOnline: muestra StaleBanner y, si no pasás onRefresh, el pull-to-refresh lo refresca. */
  query?: OnlineResult<any>;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** Contenido extra fijo abajo, junto a la acción (por ejemplo un segundo botón). */
  footer?: ReactNode;
  children: ReactNode;
}

/** Marco común de las pantallas de oficina: título, acción fija abajo, recarga por arrastre y aviso de datos desactualizados. */
export function OfficeScreen({ title, subtitle, action, query, refreshing, onRefresh, footer, children }: OfficeScreenProps) {
  const insets = useSafeAreaInsets();
  const refresh = onRefresh ?? (query ? () => query.refresh() : undefined);
  const spinning = refreshing ?? (query ? query.refreshing && query.data !== null : false);
  const hasFooter = !!action || !!footer;
  return (
    <View style={{ flex: 1, backgroundColor: C.papel }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[k.pad, { paddingBottom: hasFooter ? 24 : Math.max(40, insets.bottom + 24) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refresh ? <RefreshControl refreshing={spinning} onRefresh={() => void refresh()} tintColor={C.accion} colors={[C.accion]} /> : undefined}
      >
        <Text accessibilityRole="header" style={T.title}>
          {title}
        </Text>
        {subtitle ? <Text style={[T.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
        {query ? <StaleBanner query={query} /> : null}
        {children}
      </ScrollView>
      {hasFooter ? (
        <View style={[k.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
          {action ? <Button title={action.label} onPress={action.onPress} icon={action.icon} disabled={action.disabled} loading={action.loading} /> : null}
          {footer}
        </View>
      ) : null}
    </View>
  );
}
