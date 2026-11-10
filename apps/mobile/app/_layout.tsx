import "../src/lib/polyfills";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { dbReady } from "../src/lib/db";
import { useNotificationTap } from "../src/lib/push";
import { loadSession } from "../src/lib/session";
import { Toast } from "../src/ui/kit";
import { C, F } from "../src/ui/theme";

function NotificationTap() {
  useNotificationTap();
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsReady] = useFonts({ Fraunces_400Regular, Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  useEffect(() => {
    Promise.all([dbReady(), loadSession()]).then(() => setReady(true));
  }, []);
  if (!ready || !fontsReady)
    return (
      <View style={{ flex: 1, backgroundColor: C.papel, justifyContent: "center" }}>
        <ActivityIndicator color={C.accion} />
      </View>
    );
  return (
    <SafeAreaProvider>
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
        <Stack.Screen name="labs/roya" options={{ title: "" }} />
        <Stack.Screen name="labs/chinches" options={{ title: "" }} />
        <Stack.Screen name="labs/pasto" options={{ title: "" }} />
        <Stack.Screen name="labs/vaca" options={{ title: "" }} />
        <Stack.Screen name="labs/voz" options={{ title: "" }} />
        <Stack.Screen name="annotate/index" options={{ title: "", presentation: "modal" }} />
      </Stack>
      <Toast />
    </SafeAreaProvider>
  );
}
