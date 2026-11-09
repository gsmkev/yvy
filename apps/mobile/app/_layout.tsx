import "../src/lib/polyfills";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { dbReady } from "../src/lib/db";
import { loadSession } from "../src/lib/session";
import { C } from "../src/ui/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([dbReady(), loadSession()]).then(() => setReady(true));
  }, []);
  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: C.surco, justifyContent: "center" }}>
        <ActivityIndicator color={C.lino} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.surco },
          headerTintColor: C.lino,
          headerTitleStyle: { fontWeight: "600" },
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
