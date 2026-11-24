/** Piezas comunes de Hacienda, Agronomía y Sanidad: pantalla-índice con selector de estancia, aviso de señal y rutas. */
import type { ReactNode } from "react";
import { router, type Href } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { isFieldRole, t } from "@yvy/shared";
import { getSession } from "../lib/session";
import { useSyncStatus } from "../lib/sync";
import { EmptyState, Row, Text } from "../ui/kit";
import { T } from "../ui/theme";
import type { Farm } from "../db/store";
import { FarmChips, useFarmPick } from "./farmPick";
import { OfficeScreen } from "./OfficeScreen";
import type { OnlineResult } from "./useOnline";

/** Rol de la organización actual; los roles de campo no entran a estas pantallas. */
const useOfficeAccess = (): boolean => !isFieldRole(getSession()?.organization.role ?? "");

/** Aviso corto cuando no hay señal y la pantalla tiene una acción que la necesita. */
export function NeedsSignalNote() {
  const online = useSyncStatus().online;
  if (online) return null;
  return (
    <Text accessibilityRole="alert" style={[T.smallMedium, { marginTop: 8 }]}>
      {t("office.needs.signalToSave")}
    </Text>
  );
}

/** Indica si hay señal. */
export const useOnlineFlag = (): boolean => useSyncStatus().online;

/** Entrada de una pantalla índice: título, ayuda, ícono y destino. */
export interface HubEntry {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  /** Ruta absoluta; la estancia elegida viaja en `?farmId=`. */
  path: string;
  /** Si la ruta no usa estancia (p. ej. /animals). */
  noFarm?: boolean;
}

/** Pantalla-índice: selector de estancia y una fila por subpantalla. */
export function HubScreen({ title, entries }: { title: string; entries: HubEntry[] }) {
  const allowed = useOfficeAccess();
  const { farms, farm, setFarmId } = useFarmPick();
  if (!allowed) return <OfficeScreen title={title}><EmptyState title={t("office.sanitary.noAccess")} /></OfficeScreen>;
  return (
    <OfficeScreen title={title} subtitle={farms.length === 1 ? farm?.name : undefined}>
      {farms.length === 0 ? (
        <EmptyState title={t("office.hub.noFarms")} hint={t("office.hub.noFarmsHint")} />
      ) : (
        <>
          <FarmChips farms={farms} value={farm?.id} onChange={setFarmId} />
          {entries.map((e) => (
            <Row
              key={e.id}
              icon={e.icon}
              title={e.title}
              subtitle={e.hint}
              onPress={() => router.push((e.noFarm || !farm ? e.path : { pathname: e.path, params: { farmId: farm.id } }) as Href)}
            />
          ))}
        </>
      )}
    </OfficeScreen>
  );
}

/** Marco de una subpantalla por estancia: acceso, estancia vacía, chips de estancia y señal para la acción. */
export function FarmFrame({
  title,
  subtitle,
  farms,
  farm,
  setFarmId,
  query,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  farms: Farm[];
  farm: Farm | null;
  setFarmId: (id: string) => void;
  query?: OnlineResult<any>;
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
  children: ReactNode;
}) {
  const allowed = useOfficeAccess();
  const online = useOnlineFlag();
  if (!allowed) return <OfficeScreen title={title}><EmptyState title={t("office.sanitary.noAccess")} /></OfficeScreen>;
  return (
    <OfficeScreen title={title} subtitle={subtitle} query={query} action={action ? { ...action, disabled: !online } : undefined}>
      {farms.length === 0 ? (
        <EmptyState title={t("office.hub.noFarms")} hint={t("office.hub.noFarmsHint")} />
      ) : (
        <>
          <FarmChips farms={farms} value={farm?.id} onChange={setFarmId} />
          {action ? <NeedsSignalNote /> : null}
          {children}
        </>
      )}
    </OfficeScreen>
  );
}
