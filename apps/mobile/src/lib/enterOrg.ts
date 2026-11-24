/** Cambiar de organización (agrónomo con clientes): primero el servidor; si falla no se toca nada local. */
import { router } from "expo-router";
import { getDb } from "./db";
import { api, setSession, type Session } from "./session";
import { deviceId, startAutoSync, stopAutoSync } from "./sync";

/**
 * Cambia de organización: pide la sesión al servidor y solo si responde borra lo bajado, guarda la sesión, retoma la sincronización y vuelve a la raíz.
 * @throws OfflineError o HttpError si el servidor no acepta el cambio; en ese caso no se toca nada local.
 */
export async function enterOrganization(organizationId: string): Promise<void> {
  const next = await api<Session>("POST", "/auth/switch", { organizationId, deviceId: deviceId() });
  stopAutoSync();
  getDb().wipeSynced(); // también borra la caché de lecturas en línea
  await setSession(next);
  startAutoSync();
  router.replace("/");
}
