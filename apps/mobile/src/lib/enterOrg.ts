/** Cambia de organización con las piezas reales de la app (ver orgSwitch.ts para las reglas). Devuelve el error para mostrar, o null si entró. */
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "./db";
import { noteOrganizationEntry } from "./org";
import { wipeOnlineCache } from "./online";
import { switchOrganization } from "./orgSwitch";
import { api, getSession, setSession, type Session } from "./session";
import { deviceId, startAutoSync, stopAutoSync } from "./sync";
import { writeErrorText } from "./writeOnline";

export async function enterOrganization(organizationId: string): Promise<string | null> {
  const current = getSession();
  if (!current) return t("app.onlineSessionExpired");
  try {
    const r = await switchOrganization(
      { db: getDb(), current, requestSession: (id) => api<Session>("POST", "/auth/switch", { organizationId: id, deviceId: deviceId() }), setSession },
      organizationId,
    );
    if (!r.ok) return r.reason === "pending" ? t("app.orgSwitchBlockedPending") : r.reason === "rejected" ? t("app.orgSwitchBlockedRejected") : null;
    wipeOnlineCache();
    noteOrganizationEntry(r.session);
    // Otro motor de sincronización: los cursores quedaron en cero y se baja la organización nueva completa.
    stopAutoSync();
    startAutoSync();
    router.replace("/(tabs)");
    return null;
  } catch (e) {
    return writeErrorText(e);
  }
}
