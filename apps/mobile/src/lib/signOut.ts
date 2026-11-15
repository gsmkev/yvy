/** Cierra la sesión de esta persona: avisa al servidor, borra lo bajado (salvo lo no enviado) y vuelve al ingreso. */
import { router } from "expo-router";
import { getDb } from "./db";
import { markDemo } from "./demo";
import { api, getSession, setSession } from "./session";
import { stopAutoSync } from "./sync";

export async function signOut(): Promise<void> {
  const s = getSession();
  if (s) await api("POST", "/auth/logout", { refreshToken: s.refreshToken }, false).catch(() => {});
  stopAutoSync();
  getDb().wipeSynced();
  markDemo(null);
  await setSession(null);
  router.replace("/login");
}
