/** Vista previa web del dibujo de lotes: el editor usa MapLibre Native, que no existe en el navegador, así que solo muestra un aviso. */
import { View } from "react-native";
import { t } from "@yvy/shared";
import { EmptyState, s as k } from "../src/ui/kit";

/** Aviso en lugar del editor de lotes en la vista web. */
export default function PlotDrawWeb() {
  return (
    <View style={[k.screen, k.pad]}>
      <EmptyState title={t("app.common.webPreviewOnlyPhone")} />
    </View>
  );
}
