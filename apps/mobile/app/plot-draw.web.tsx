// Vista previa web: el dibujo de lotes usa MapLibre Native, que no existe en el navegador.
// ponytail: aviso en vez de un segundo editor; si la vista web pasa a ser producto, portar con MapLibre GL JS como map.web.tsx.
import { View } from "react-native";
import { t } from "@yvy/shared";
import { EmptyState, s as k } from "../src/ui/kit";

export default function PlotDrawWeb() {
  return (
    <View style={[k.screen, k.pad]}>
      <EmptyState title={t("app.common.webPreviewOnlyPhone")} />
    </View>
  );
}
