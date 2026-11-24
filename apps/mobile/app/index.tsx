/** Entrada de la app: redirige según haya sesión o no. */
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession, useSessionLoaded } from "../src/lib/session";
import { C } from "../src/ui/theme";

/** Redirige a la pantalla principal o al ingreso. */
export default function Index() {
  const loaded = useSessionLoaded();
  const session = useSession();
  if (!loaded)
    return (
      <View style={{ flex: 1, backgroundColor: C.papel, justifyContent: "center" }}>
        <ActivityIndicator color={C.accion} />
      </View>
    );
  return <Redirect href={session ? "/(tabs)" : "/login"} />;
}
