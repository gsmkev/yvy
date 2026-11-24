/**
 * Mapa: satélite propio de la estancia (PMTiles local si se descargó), lotes, últimas anotaciones y "dónde estoy".
 * Tocar un lote abre su ficha abajo; desde ahí se anota en ese lote.
 * Los datos, el estilo, la brújula y los paneles viven en src/map/.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Camera, Map, Marker, type CameraRef } from "@maplibre/maplibre-react-native";
import { router, useFocusEffect } from "expo-router";
import { t } from "@yvy/shared";
import { containsPoint, samplingGrid, type Area } from "@yvy/geo";
import { distanceM } from "../../src/lib/bearing";
import { getDb } from "../../src/lib/db";
import { copyText } from "../../src/lib/copy";
import { fixCoords } from "../../src/lib/coords";
import { currentFix, type Fix } from "../../src/lib/location";
import { layerSource, type MapLayer } from "../../src/lib/offline";
import { setFabHidden } from "../../src/lib/fab";
import { showToast } from "../../src/lib/toast";
import { plotLabels } from "../../src/lib/plotLabels";
import { MapPlotSheet } from "../../src/map/MapPlotSheet";
import { MapTools, MapTopPanels, type MapPanelName } from "../../src/map/MapOverlays";
import { buildMapStyle } from "../../src/map/mapStyle";
import { st } from "../../src/map/styles";
import { useMapCompass } from "../../src/map/useMapCompass";
import { useMapData } from "../../src/map/useMapData";
import { Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

const FIT_PADDING = { top: 120, bottom: 40, left: 24, right: 24 };
const PLOT_PADDING = { top: 120, bottom: 320, left: 40, right: 40 };
const MAX_LABELS = 60;
const MAX_SAMPLES = 150;

/** Pestaña Mapa: estancias, lotes y registros con MapLibre Native. */
export default function MapScreen() {
  const { farmId, farms, plots, records, lastVisit, pois, taskPoints, remoteBase, farm, readOnly, canMarkPoi } =
    useMapData();
  const [selected, setSelected] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFabHidden(!!selected);
      return () => setFabHidden(false);
    }, [selected]),
  );
  const [mode, setModeState] = useState<MapLayer>(() =>
    getDb().getKv("map_layer") === "ndvi" ? "ndvi" : "true_color",
  );
  const setMode = (m: MapLayer) => {
    setModeState(m);
    getDb().setKv("map_layer", m);
  };
  // Grilla de muestreo de suelo del lote elegido (hectáreas por punto), calculada en el celular
  const [gridHa, setGridHa] = useState<5 | 10 | null>(null);
  const [me, setMe] = useState<Fix | null>(null);
  const [copied, setCopied] = useState(false);
  // Los paneles de la barra arrancan cerrados: el mapa va despejado.
  const [panel, setPanel] = useState<MapPanelName>(null);
  const camera = useRef<CameraRef>(null);
  const { follow, setFollow, bearing, northUp, onBearing } = useMapCompass(camera);
  // Al elegir un lote la cámara se ajusta a sus límites, dejando lugar a la ficha de abajo.
  useEffect(() => {
    const p = plots.find((x) => x.id === selected);
    if (p)
      camera.current?.fitBounds([p.minLon, p.minLat, p.maxLon, p.maxLat], { padding: PLOT_PADDING, duration: 600 });
  }, [selected]);
  const firstFarm = useRef(true);
  useEffect(() => {
    if (firstFarm.current) {
      firstFarm.current = false;
      return;
    }
    setSelected(null);
    if (farm)
      camera.current?.fitBounds([farm.minLon, farm.minLat, farm.maxLon, farm.maxLat], {
        padding: FIT_PADDING,
        duration: 600,
      });
  }, [farm?.id]);

  // La etiqueta va en un punto garantizado adentro del lote (el centro del bbox cae afuera en lotes en L o U).
  // Son vistas nativas: con muchos lotes solo se rotulan los de la estancia elegida y los MAX_LABELS más grandes.
  const labels = useMemo(
    () => plotLabels(farmId ? plots : plots.filter((p) => p.farmId === farm?.id), MAX_LABELS),
    [plots, farm?.id, farmId],
  );

  const samples = useMemo(() => {
    const p = plots.find((x) => x.id === selected);
    return p && gridHa ? samplingGrid(JSON.parse(p.geometry) as Area, gridHa).slice(0, MAX_SAMPLES) : [];
  }, [plots, selected, gridHa]);

  const ndvi = useMemo(
    () => (farm && mode === "ndvi" ? layerSource(farm.id, "ndvi", remoteBase) : null),
    [farm?.id, mode, remoteBase],
  );

  const style = useMemo(
    () => buildMapStyle({ farms, plots, records, pois, taskPoints, me, selected, lastVisit, mode, remoteBase }),
    [farms, plots, records, pois, remoteBase, selected, me, lastVisit, mode, taskPoints],
  );

  if (!farm) {
    return (
      <View style={[st.center, { backgroundColor: C.papel }]}>
        <Text style={T.body}>{t("ui.common.loading")}</Text>
      </View>
    );
  }
  const plot = plots.find((p) => p.id === selected);

  const copyMe = async () => {
    if (!me) return;
    if (await copyText(fixCoords(me))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const locate = async () => {
    showToast(t("app.gps.searching"), 8000);
    const f = await currentFix(8000);
    if (!f) return showToast(t("app.gps.noneHint"), 6000);
    setMe(f);
    camera.current?.flyTo({ center: [f.lon, f.lat], zoom: 15, duration: 800 });
  };

  const onMapPress = (lon: number, lat: number) => {
    // Un toque cerca de una tarea con punto lleva ahí
    const task = taskPoints.find((p) => distanceM({ lon, lat }, p) < 40);
    if (task)
      return router.push({
        pathname: "/goto",
        params: { lon: String(task.lon), lat: String(task.lat), name: task.title },
      });
    setSelected(plots.find((p) => containsPoint(JSON.parse(p.geometry) as Area, lon, lat))?.id ?? null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#141a12" }}>
      <Map
        style={{ flex: 1 }}
        mapStyle={style}
        attribution={false}
        logo={false}
        compass={false}
        onRegionIsChanging={(e) => onBearing(e.nativeEvent.bearing)}
        onPress={(e) => onMapPress(...(e.nativeEvent.lngLat as unknown as [number, number]))}
      >
        <Camera
          ref={camera}
          initialViewState={{
            bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat],
            padding: { top: 40, bottom: 40, left: 24, right: 24 },
          }}
        />
        {samples.map((p) => (
          <Marker key={`s${p.n}`} lngLat={[p.lon, p.lat]}>
            <View style={st.sample} accessible accessibilityLabel={t("app.sampling.point", { n: p.n })}>
              <Text style={st.sampleText}>{p.n}</Text>
            </View>
          </Marker>
        ))}
        {labels.map((l) => (
          <Marker key={l.id} lngLat={[l.lon, l.lat]}>
            <Text numberOfLines={1} style={st.label} pointerEvents="none">
              {l.name}
            </Text>
          </Marker>
        ))}
      </Map>
      <MapTopPanels
        panel={panel}
        mode={mode}
        setMode={setMode}
        me={me}
        copied={copied}
        copyMe={copyMe}
        canMarkPoi={canMarkPoi}
        ndvi={ndvi}
      />
      <Text style={st.attr}>{t("app.map.imageryCredit")}</Text>
      <MapTools
        panel={panel}
        setPanel={setPanel}
        bearing={bearing}
        follow={follow}
        setFollow={setFollow}
        locate={locate}
        northUp={northUp}
      />
      {plot && (
        <MapPlotSheet
          plot={plot}
          records={records}
          lastVisit={lastVisit}
          readOnly={readOnly}
          canMarkPoi={canMarkPoi}
          gridHa={gridHa}
          setGridHa={setGridHa}
          samplesCount={samples.length}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}
