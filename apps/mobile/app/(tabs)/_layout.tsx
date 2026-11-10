import { useEffect } from "react";
import { Pressable, StyleSheet, Text, type ColorValue } from "react-native";
import { Redirect, Tabs, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClipboardList, Map, MoreHorizontal, Plus, Sun, type LucideIcon } from "lucide-react-native";
import { t } from "@yvy/shared";
import { useSession } from "../../src/lib/session";
import { useFabHidden } from "../../src/lib/fab";
import { startAutoSync, useSyncStatus } from "../../src/lib/sync";
import { SyncBar } from "../../src/ui/kit";
import { C, F } from "../../src/ui/theme";

const icon =
  (I: LucideIcon) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <I size={24} color={String(color)} strokeWidth={focused ? 2.4 : 1.8} />
  );

export default function TabsLayout() {
  const session = useSession();
  const { pending } = useSyncStatus();
  const fabHidden = useFabHidden();
  useEffect(() => (session ? startAutoSync() : undefined), [!!session]);
  if (!session) return <Redirect href="/login" />;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.papel }}>
      <SyncBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.tinta,
          tabBarInactiveTintColor: C.tinta3,
          tabBarStyle: {
            height: 72,
            paddingBottom: 12,
            paddingTop: 8,
            backgroundColor: C.papel,
            borderTopColor: C.linea,
          },
          tabBarLabelStyle: { fontFamily: F.sansMedium, fontSize: 12, lineHeight: 16 },
          sceneStyle: { backgroundColor: C.papel },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t("app.today"), tabBarIcon: icon(Sun) }} />
        <Tabs.Screen name="map" options={{ title: t("app.map"), tabBarIcon: icon(Map) }} />
        <Tabs.Screen
          name="history"
          options={{
            title: t("app.history"),
            tabBarIcon: icon(ClipboardList),
            tabBarBadge: pending > 0 ? pending : undefined,
            tabBarBadgeStyle: { backgroundColor: C.atencionSuave, color: C.atencion, fontFamily: F.sansSemi },
          }}
        />
        <Tabs.Screen name="more" options={{ title: t("app.more"), tabBarIcon: icon(MoreHorizontal) }} />
      </Tabs>
      {/* Una sola acción principal en toda la app */}
      {!fabHidden && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.annotate")}
          onPress={() => router.push("/annotate")}
          style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <Plus size={26} color={C.blanco} strokeWidth={2.6} />
          <Text style={s.fabText}>{t("app.annotate")}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 88,
    height: 60,
    paddingLeft: 18,
    paddingRight: 24,
    borderRadius: 30,
    backgroundColor: C.accion,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { fontFamily: F.sansSemi, fontSize: 18, color: C.blanco },
});
