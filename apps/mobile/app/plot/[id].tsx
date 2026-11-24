/**
 * Ficha del lote (F-23): lo que conviene saber antes de anotar, todo desde el celular y sin señal: vigor, lluvia del
 * mes, tareas abiertas y las últimas anotaciones. Para roles de oficina suma (ola 2): vigor contra la estancia y su
 * curva, historial de campañas, carencia, fenología, balance hídrico, pronóstico, edición de atributos y borrado.
 */
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "@yvy/shared";
import { isOwnerMode } from "../../src/lib/ownerSummary";
import { useReadOnly } from "../../src/lib/readOnly";
import { useSession } from "../../src/lib/session";
import { PlotBody } from "../../src/plotSheet/PlotBody";
import { usePlotData } from "../../src/plotSheet/usePlotData";
import { ScreenBody, s as k, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

export default function PlotSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const readOnly = useReadOnly();
  const office = isOwnerMode(session?.organization.role);
  const data = usePlotData(id, office);
  if (!data)
    return (
      <View style={k.screen}>
        <Stack.Screen options={{ title: "" }} />
        <ScreenBody>
          <Text style={T.heading}>{t("app.plotGone")}</Text>
        </ScreenBody>
      </View>
    );
  return <PlotBody data={data} office={office} canEdit={office && !readOnly} readOnly={readOnly} />;
}
