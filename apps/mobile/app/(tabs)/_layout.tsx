import { useEffect } from "react";
import type { ColorValue } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClipboardList, Map, MoreHorizontal, Plus, Sun, type LucideIcon } from "lucide-react-native";
import { t } from "@yvy/shared";
import { useSession } from "../../src/lib/session";
import { startAutoSync, useSyncStatus } from "../../src/lib/sync";
import { SyncBar } from "../../src/ui/kit";
import { C } from "../../src/ui/theme";

const icon =
  (I: LucideIcon) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <I size={24} color={String(color)} strokeWidth={focused ? 2.4 : 1.9} />
  );

export default function TabsLayout() {
  const session = useSession();
  const { pending } = useSyncStatus();
  useEffect(() => (session ? startAutoSync() : undefined), [!!session]);
  if (!session) return <Redirect href="/login" />;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.surco }}>
      <SyncBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.accion,
          tabBarInactiveTintColor: C.tinta2,
          tabBarStyle: {
            height: 74,
            paddingBottom: 14,
            paddingTop: 6,
            backgroundColor: C.papel,
            borderTopColor: C.linea,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
          sceneStyle: { backgroundColor: C.lino },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t("app.today"), tabBarIcon: icon(Sun) }} />
        <Tabs.Screen name="map" options={{ title: t("app.map"), tabBarIcon: icon(Map) }} />
        <Tabs.Screen name="new" options={{ title: t("app.newRecord"), tabBarIcon: icon(Plus) }} />
        <Tabs.Screen
          name="history"
          options={{
            title: t("app.history"),
            tabBarIcon: icon(ClipboardList),
            tabBarBadge: pending > 0 ? pending : undefined,
            tabBarBadgeStyle: { backgroundColor: C.trigo, color: C.surco },
          }}
        />
        <Tabs.Screen name="more" options={{ title: t("app.more"), tabBarIcon: icon(MoreHorizontal) }} />
      </Tabs>
    </SafeAreaView>
  );
}
