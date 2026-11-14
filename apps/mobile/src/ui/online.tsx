/**
 * Piezas de las pantallas en línea (ola 0): el cuerpo que resuelve cargando / sin señal / error / datos, el aviso
 * "datos de hace X" y el botón de escritura que dice "Necesita conexión" cuando no hay red.
 */
import type { ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { CloudOff } from "lucide-react-native";
import { t } from "@yvy/shared";
import { ageOf, DEFAULT_TTL_MS } from "../lib/httpCache";
import { ageText } from "../lib/ageText";
import type { OnlineQuery } from "../lib/online";
import { Button, EmptyState, s as k, Text } from "./kit";
import { C, GUTTER, RADIUS, T } from "./theme";

/**
 * Aviso de antigüedad: solo aparece cuando lo que se ve no es de ahora (copia local con el dato vencido o sin señal).
 * Con datos frescos no dice nada.
 */
export function StaleBanner({ at, offline, ttlMs = DEFAULT_TTL_MS }: { at: number | null; offline: boolean; ttlMs?: number }) {
  if (at === null) return null;
  const age = ageOf(at, Date.now());
  const old = Date.now() - at >= ttlMs;
  if (!offline && !old) return null;
  const when = ageText(age);
  return (
    <View style={st.banner} accessibilityLiveRegion="polite">
      {offline && <CloudOff size={16} color={C.atencion} strokeWidth={2} />}
      <Text style={[T.smallMedium, { color: C.atencion, flex: 1 }]}>{offline ? t("app.staleOffline", { when }) : t("app.staleData", { when })}</Text>
    </View>
  );
}

/** Esqueleto de carga: bloques del alto de una fila, para que la pantalla no salte cuando llegan los datos. */
export function Skeleton({ rows = 4, height = 64 }: { rows?: number; height?: number }) {
  return (
    <View accessibilityLabel={t("ui.loading")} style={{ gap: 12, marginTop: 20 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[st.skeleton, { height }]} />
      ))}
    </View>
  );
}

/**
 * Cuerpo de una pantalla que lee de la API: desliza para refrescar, y según el estado muestra el esqueleto, "Esto
 * necesita señal" (sin copia y sin red), el error del servidor, o los datos con el aviso de antigüedad.
 * La función hijo solo corre cuando hay datos.
 */
export function OnlineScreen<T>({ q, children, footer, ttlMs, title }: { q: OnlineQuery<T>; children: (data: T) => ReactNode; footer?: ReactNode; ttlMs?: number; title?: ReactNode }) {
  const refresh = <RefreshControl refreshing={q.refreshing} onRefresh={() => q.reload(true)} tintColor={C.accion} colors={[C.accion]} />;
  let body: ReactNode;
  if (q.data !== null) {
    body = (
      <>
        <StaleBanner at={q.at} offline={q.offline} ttlMs={ttlMs} />
        {q.error && <ErrorNote message={q.error.message} status={q.error.status} onRetry={() => q.reload(true)} />}
        {children(q.data)}
      </>
    );
  } else if (q.loading) body = <Skeleton />;
  else if (q.offline) body = <EmptyState title={t("app.needsSignalTitle")} hint={t("app.needsSignalHint")} action={t("app.retry")} onAction={() => q.reload(true)} />;
  else if (q.error) body = <ErrorNote message={q.error.message} status={q.error.status} onRetry={() => q.reload(true)} block />;
  else body = <Skeleton />;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={k.pad} refreshControl={refresh} keyboardShouldPersistTaps="handled">
        {title}
        {body}
      </ScrollView>
      {footer}
    </View>
  );
}

/** Qué pasó y qué hacer: sin permiso, ya no existe, o falló el servidor. */
export function ErrorNote({ message, status, onRetry, block }: { message: string; status: number; onRetry?: () => void; block?: boolean }) {
  const text = status === 403 ? t("app.onlineForbidden") : status === 404 ? t("app.onlineNotFound") : message && !/^HTTP \d+$/.test(message) ? message : t("app.onlineGenericError");
  return (
    <View style={[st.error, block && { marginTop: 24 }]} accessibilityRole="alert">
      <Text style={[T.body, { color: C.peligro }]}>{text}</Text>
      {onRetry && status !== 403 && status !== 404 ? <Button kind="text" title={t("app.retry")} onPress={onRetry} style={{ alignSelf: "flex-start", marginTop: 4 }} /> : null}
    </View>
  );
}

/**
 * Botón de una escritura en línea. Sin señal dice "Necesita conexión" y no se puede tocar; mientras manda muestra el
 * indicador. El error de un intento anterior va debajo, en el lugar donde la persona está mirando.
 */
export function OnlineButton({
  title,
  onPress,
  offline,
  sending,
  error,
  kind = "primary",
  disabled,
}: {
  title: string;
  onPress: () => void;
  offline: boolean;
  sending: boolean;
  error?: string | null;
  kind?: "primary" | "secondary" | "text" | "danger";
  disabled?: boolean;
}) {
  return (
    <View>
      <Button kind={kind} title={offline ? t("app.needsConnection") : title} onPress={onPress} disabled={offline || disabled} loading={sending} />
      {error && !offline ? (
        <Text accessibilityRole="alert" style={[T.small, { color: C.peligro, marginTop: 8 }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Busy() {
  return <ActivityIndicator color={C.accion} style={{ marginTop: 24 }} />;
}

const st = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.atencionSuave, borderRadius: RADIUS, paddingVertical: 10, paddingHorizontal: 14, marginTop: 4, marginBottom: 8 },
  skeleton: { backgroundColor: C.linea, borderRadius: RADIUS, opacity: 0.6 },
  error: { backgroundColor: C.peligroSuave, borderRadius: RADIUS, padding: GUTTER - 4, marginVertical: 8 },
});
