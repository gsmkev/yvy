import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Compass, Layers, LocateFixed, Navigation, Wrench } from "lucide-react-native";
import { t } from "@yvy/shared";
import { formatFix } from "../lib/coords";
import type { Fix } from "../lib/location";
import type { MapLayer } from "../lib/offline";
import { FarmLine } from "../ui/FarmLine";
import { LayerSwitch, NdviLegend } from "../ui/MapLayerControls";
import { Row, Text } from "../ui/kit";
import { MapPanel, MapToolbar, MapToolButton } from "../ui/MapToolbar";
import { T } from "../ui/theme";
import { st } from "./styles";

export type MapPanelName = "layers" | "tools" | null;

/** Arriba a la izquierda: estancia, y según el panel abierto las capas (con coordenadas) o las herramientas. */
export function MapTopPanels({ panel, mode, setMode, me, copied, copyMe, canMarkPoi, ndvi }: {
  panel: MapPanelName;
  mode: MapLayer;
  setMode: (m: MapLayer) => void;
  me: Fix | null;
  copied: boolean;
  copyMe: () => void;
  canMarkPoi: boolean;
  ndvi: { acquiredAt: number | null } | null;
}) {
  return (
    <View style={st.topLeft} pointerEvents="box-none">
      <FarmLine style={st.panel} />
      {panel === "layers" && (
        <>
          <LayerSwitch value={mode} onChange={setMode} />
          {me && (
            <Pressable accessibilityRole="button" accessibilityLabel={`${formatFix(me)}. ${t("app.coordsCopy")}`} onPress={copyMe} style={st.coords}>
              <Text style={T.small}>{copied ? t("app.copied") : formatFix(me)}</Text>
            </Pressable>
          )}
        </>
      )}
      {panel === "tools" && (
        <MapPanel>
          <Row title={t("app.poiScan")} onPress={() => router.push("/scan-poi")} />
          {canMarkPoi && <Row title={t("app.poiMark")} onPress={() => router.push("/poi")} />}
          {canMarkPoi && <Row title={t("app.plotDrawStart")} onPress={() => router.push("/plot-draw")} />}
          {canMarkPoi && <Row title={t("app.perimWalkMenu")} onPress={() => router.push({ pathname: "/plot-draw", params: { mode: "walk" } })} />}
        </MapPanel>
      )}
      {mode === "ndvi" && <NdviLegend acquiredAt={ndvi?.acquiredAt ?? null} missing={!ndvi} />}
    </View>  );
}

/** Barra de herramientas de la derecha. */
export function MapTools({ panel, setPanel, bearing, follow, setFollow, locate, northUp }: {
  panel: MapPanelName;
  setPanel: (fn: (p: MapPanelName) => MapPanelName) => void;
  bearing: number;
  follow: boolean;
  setFollow: (fn: (v: boolean) => boolean) => void;
  locate: () => void;
  northUp: () => void;
}) {
  return (
    <View style={st.toolbar} pointerEvents="box-none">
      <MapToolbar>
        <MapToolButton icon={LocateFixed} label={t("app.whereAmI")} onPress={locate} />
        <MapToolButton icon={Compass} label={t("app.compassNorth")} onPress={northUp} rotate={-bearing} />
        <MapToolButton icon={Navigation} label={follow ? t("app.compassFollowOff") : t("app.compassFollowOn")} role="switch" active={follow} onPress={() => setFollow((v) => !v)} />
        <MapToolButton icon={Layers} label={t("app.mapLayers")} active={panel === "layers"} onPress={() => setPanel((p) => (p === "layers" ? null : "layers"))} />
        <MapToolButton icon={Wrench} label={t("app.mapTools")} active={panel === "tools"} onPress={() => setPanel((p) => (p === "tools" ? null : "tools"))} />
      </MapToolbar>
    </View>  );
}
