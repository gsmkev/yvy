/** Raíz de la app: polyfills, fuentes, sesión, base local, sincronización y la pila de pantallas. */
import "../src/lib/polyfills";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { getLocale, subscribeLocale } from "@yvy/shared";
import { dbReady, getDb } from "../src/lib/db";
import { loadLocale } from "../src/lib/locale";
import { initMonitoring } from "../src/lib/monitoring";
import { useNotificationTap } from "../src/lib/push";
import { loadSession } from "../src/lib/session";
import { Toast } from "../src/ui/kit";
import { stackScreenOptions } from "../src/ui/stackOptions";
import { C } from "../src/ui/theme";

initMonitoring();

function NotificationTap() {
  useNotificationTap();
  return null;
}

/** Layout raíz: carga el idioma guardado, prepara la sesión y la base local y dibuja la pila de navegación. */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsReady] = useFonts({ Fraunces_400Regular, Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  useEffect(() => {
    Promise.all([dbReady(), loadSession()]).then(() => {
      loadLocale(getDb()); // el idioma guardado, antes de dibujar la primera pantalla
      setReady(true);
    });
  }, []);
  // Al cambiar el idioma se vuelve a armar toda la app para que cada pantalla tome los textos nuevos
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  if (!ready || !fontsReady)
    return (
      <View style={{ flex: 1, backgroundColor: C.papel, justifyContent: "center" }}>
        <ActivityIndicator color={C.accion} />
      </View>
    );
  return (
    <SafeAreaProvider key={locale}>
      <StatusBar style="dark" />
      <NotificationTap />
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: "" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="record/[id]" options={{ title: "" }} />
        <Stack.Screen name="task/[id]" options={{ title: "" }} />
        <Stack.Screen name="plot/[id]" options={{ title: "" }} />
        <Stack.Screen name="poi" options={{ title: "" }} />
        <Stack.Screen name="plot-draw" options={{ title: "" }} />
        <Stack.Screen name="stock-count" options={{ title: "" }} />
        <Stack.Screen name="sync" options={{ title: "" }} />
        <Stack.Screen name="account" options={{ title: "" }} />
        <Stack.Screen name="notifications" options={{ title: "" }} />
        <Stack.Screen name="animals" options={{ title: "" }} />
        <Stack.Screen name="goto" options={{ title: "" }} />
        <Stack.Screen name="emergency" options={{ title: "" }} />
        <Stack.Screen name="walk" options={{ title: "" }} />
        <Stack.Screen name="scan-poi" options={{ title: "" }} />
        <Stack.Screen name="labs/roya" options={{ title: "" }} />
        <Stack.Screen name="labs/chinches" options={{ title: "" }} />
        <Stack.Screen name="labs/pasto" options={{ title: "" }} />
        <Stack.Screen name="labs/vaca" options={{ title: "" }} />
        <Stack.Screen name="labs/voz" options={{ title: "" }} />
        <Stack.Screen name="labs/malezas" options={{ title: "" }} />
        <Stack.Screen name="labs/caravana" options={{ title: "" }} />
        <Stack.Screen name="labs/fenologia" options={{ title: "" }} />
        <Stack.Screen name="labs/guarani" options={{ title: "" }} />
        {/* Pantallas de oficina: el grupo trae su propio Stack (app/office/_layout.tsx); agregar app/office/x.tsx no toca este archivo. */}
        <Stack.Screen name="office" options={{ headerShown: false }} />
        <Stack.Screen name="annotate/index" options={{ title: "", presentation: "modal" }} />
      </Stack>
      <Toast />
    </SafeAreaProvider>
  );
}
