/** Cambiar de organización (agrónomo con clientes): primero el servidor; si falla no se toca nada local. */
import { router } from "expo-router";
import { getDb } from "./db";
import { api, setSession, type Session } from "./session";
import { deviceId, startAutoSync, stopAutoSync } from "./sync";

export async function enterOrganization(organizationId: string): Promise<void> {
  const next = await api<Session>("POST", "/auth/switch", { organizationId, deviceId: deviceId() });
  stopAutoSync();
  getDb().wipeSynced(); // también borra la caché de lecturas en línea
  await setSession(next);
  startAutoSync();
  router.replace("/");
}
