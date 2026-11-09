import { useEffect } from "react";
import { Text, type ColorValue } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "@yvy/shared";
import { useSession } from "../../src/lib/session";
import { startAutoSync } from "../../src/lib/sync";
import { SyncBar } from "../../src/ui/kit";
import { C } from "../../src/ui/theme";

const icon =
  (glyph: string) =>
  ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 22, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const session = useSession();
  useEffect(() => (session ? startAutoSync() : undefined), [!!session]);
  if (!session) return <Redirect href="/login" />;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.surco }}>
      <SyncBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.soja,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: { height: 64, paddingBottom: 8 },
          tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
          sceneStyle: { backgroundColor: C.lino },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t("app.today"), tabBarIcon: icon("☀") }} />
        <Tabs.Screen name="map" options={{ title: t("app.map"), tabBarIcon: icon("🗺") }} />
        <Tabs.Screen name="new" options={{ title: t("app.newRecord"), tabBarIcon: icon("＋") }} />
        <Tabs.Screen name="history" options={{ title: t("app.history"), tabBarIcon: icon("☰") }} />
        <Tabs.Screen name="more" options={{ title: t("app.more"), tabBarIcon: icon("⋯") }} />
      </Tabs>
    </SafeAreaView>
  );
}
