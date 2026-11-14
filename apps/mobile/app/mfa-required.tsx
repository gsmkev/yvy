/**
 * P-08: el dueño exige segundo factor a los administradores y este todavía no lo activó. La API rechaza todo salvo
 * /auth/totp, así que en vez de una app vacía con errores se explica qué falta. Activarlo desde la app es de la ola 3;
 * por ahora se hace una vez en la web.
 */
import { View } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { api, getSession, setSession } from "../src/lib/session";
import { stopAutoSync } from "../src/lib/sync";
import { Button, s as k, Text } from "../src/ui/kit";
import { T } from "../src/ui/theme";

export default function MfaRequired() {
  const leave = async () => {
    const s = getSession();
    if (s) await api("POST", "/auth/logout", { refreshToken: s.refreshToken }, false).catch(() => undefined);
    stopAutoSync();
    getDb().wipeSynced();
    await setSession(null);
    router.replace("/login");
  };
  return (
    <View style={[k.screen, k.pad, { justifyContent: "center" }]}>
      <Text style={T.title}>{t("app.mfaRequiredTitle")}</Text>
      <Text style={[T.body, { marginTop: 12 }]}>{t("app.mfaRequiredBody")}</Text>
      <Button title={t("app.logout")} onPress={() => void leave()} style={{ marginTop: 32 }} />
    </View>
  );
}
