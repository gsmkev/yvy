import "../src/lib/polyfills";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadSession } from "../src/lib/session";
import { C } from "../src/ui/theme";

export default function RootLayout() {
  useEffect(() => {
    loadSession();
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.surco },
          headerTintColor: C.lino,
          contentStyle: { backgroundColor: C.lino },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: "" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="record/[kind]" options={{ title: "" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
