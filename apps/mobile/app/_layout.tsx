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
import { C, F } from "../src/ui/theme";

initMonitoring();

function NotificationTap() {
  useNotificationTap();
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsReady] = useFonts({ Fraunces_400Regular, Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  useEffect(() => {
    Promise.all([dbReady(), loadSession()]).then(() => {
      loadLocale(getDb()); // U-22: el idioma guardado, antes de dibujar la primera pantalla
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
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.papel },
          headerShadowVisible: false,
          headerTintColor: C.tinta,
          headerTitleStyle: { fontFamily: F.sansSemi, fontSize: 18 },
          contentStyle: { backgroundColor: C.papel },
        }}
      >
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
        <Stack.Screen name="mfa-required" options={{ headerShown: false }} />
        <Stack.Screen name="orgs" options={{ title: "" }} />
        <Stack.Screen name="manage/dashboard" options={{ title: "" }} />
        <Stack.Screen name="annotate/index" options={{ title: "", presentation: "modal" }} />
      </Stack>
      <Toast />
    </SafeAreaProvider>
  );
}
