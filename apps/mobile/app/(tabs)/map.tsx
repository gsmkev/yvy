/**
 * Mapa: satélite propio de la estancia (PMTiles local si se descargó), lotes, últimas anotaciones y "dónde estoy".
 * Tocar un lote abre su ficha abajo; desde ahí se anota en ese lote.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, Map, type CameraRef, type StyleSpecification } from "@maplibre/maplibre-react-native";
import { router, useFocusEffect } from "expo-router";
import { LocateFixed, X } from "lucide-react-native";
import { BRAND, describeRecord, t } from "@yvy/shared";
import { centroidOf, containsPoint, type Area } from "@yvy/geo";
import { useRef } from "react";
import { useSession } from "../../src/lib/session";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { copyText } from "../../src/lib/copy";
import { fixCoords, formatFix } from "../../src/lib/coords";
import { currentFix, type Fix } from "../../src/lib/location";
import { layerSource, tilesBaseUrl, type MapLayer } from "../../src/lib/offline";
import { setFabHidden } from "../../src/lib/fab";
import { useLocal } from "../../src/lib/useLocal";
import { FarmLine } from "../../src/ui/FarmLine";
import { Button } from "../../src/ui/kit";
import { LayerSwitch, NdviLegend } from "../../src/ui/MapLayerControls";
import { C, F, GUTTER, RADIUS, T } from "../../src/ui/theme";

const FIT_PADDING = { top: 120, bottom: 40, left: 24, right: 24 };
const PLOT_PADDING = { top: 120, bottom: 320, left: 40, right: 40 };
const daysAgo = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000);

export default function MapScreen() {
  const { farmId, current } = useFarmChoice();
  const farms = useLocal(() => byFarm(getDb().farms().map((f) => ({ ...f, farmId: f.id })), farmId), [farmId]);
  const plots = useLocal(() => byFarm(getDb().plots(), farmId), [farmId]);
  const records = useLocal(() => byFarm(getDb().records(300), farmId), [farmId]);
  const lastVisit = useLocal(() => getDb().lastVisitByPlot());
  const [remoteBase, setRemoteBase] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFabHidden(!!selected);
      return () => setFabHidden(false);
    }, [selected]),
  );
  const [mode, setModeState] = useState<MapLayer>(() => (getDb().getKv("map_layer") === "ndvi" ? "ndvi" : "true_color"));
  const setMode = (m: MapLayer) => {
    setModeState(m);
    getDb().setKv("map_layer", m);
  };
  const [me, setMe] = useState<Fix | null>(null);
  const [copied, setCopied] = useState(false);
  const camera = useRef<CameraRef>(null);
  const farm = current ?? farms[0];
  // M-13: al elegir un lote la cámara se ajusta a sus límites, dejando lugar a la ficha de abajo.
  useEffect(() => {
    const p = plots.find((x) => x.id === selected);
    if (p) camera.current?.fitBounds([p.minLon, p.minLat, p.maxLon, p.maxLat], { padding: PLOT_PADDING, duration: 600 });
  }, [selected]);
  const firstFarm = useRef(true);
  useEffect(() => {
    if (firstFarm.current) {
      firstFarm.current = false;
      return;
    }
    setSelected(null);
    if (farm) camera.current?.fitBounds([farm.minLon, farm.minLat, farm.maxLon, farm.maxLat], { padding: FIT_PADDING, duration: 600 });
  }, [farm?.id]);
  const canMarkPoi = useSession()?.organization.role !== "worker";
  useEffect(() => {
    tilesBaseUrl().then(setRemoteBase, () => setRemoteBase(null));
  }, []);

  const ndvi = useMemo(() => (farm && mode === "ndvi" ? layerSource(farm.id, "ndvi", remoteBase) : null), [farm?.id, mode, remoteBase]);

  const style = useMemo<StyleSpecification>(() => {
    const sources: StyleSpecification["sources"] = {};
    const layers: StyleSpecification["layers"] = [{ id: "bg", type: "background", paint: { "background-color": "#141a12" } }];
    for (const f of farms) {
      const src = layerSource(f.id, mode, remoteBase);
      if (src) {
        sources[`base-${f.id}`] = { type: "raster", url: src.url, tileSize: 256 };
        layers.push({ id: `base-${f.id}`, type: "raster", source: `base-${f.id}` });
      }
    }
    const feature = (geometry: string, properties: Record<string, unknown> = {}) => ({ type: "Feature" as const, properties, geometry: JSON.parse(geometry) });
    sources.farms = { type: "geojson", data: { type: "FeatureCollection", features: farms.map((f) => feature(f.geometry)) } };
    sources.plots = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: plots.map((p) => feature(p.geometry, { sel: p.id === selected ? 1 : 0, stale: (lastVisit.get(p.id) ? daysAgo(lastVisit.get(p.id)!) : 99) >= 7 ? 1 : 0 })),
      },
    };
    sources.records = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: records
          .filter((r) => r.lat !== null)
          .map((r) => ({ type: "Feature" as const, properties: { pending: r.pending ? 1 : 0 }, geometry: { type: "Point" as const, coordinates: [r.lon!, r.lat!] } })),
      },
    };
    if (me) sources.me = { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [me.lon, me.lat] } } };
    layers.push(
      { id: "farms", type: "line", source: "farms", paint: { "line-color": "rgba(255,255,255,0.9)", "line-width": 2 } },
      { id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": "#ffffff", "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.28, 0.04] } },
      {
        id: "plots-line",
        type: "line",
        source: "plots",
        paint: {
          "line-color": ["case", ["==", ["get", "sel"], 1], "#ffffff", ["==", ["get", "stale"], 1], BRAND.trigo, "rgba(255,255,255,0.7)"],
          "line-width": ["case", ["==", ["get", "sel"], 1], 3, 1.5],
        },
      },
      { id: "records", type: "circle", source: "records", paint: { "circle-radius": 5, "circle-color": ["case", ["==", ["get", "pending"], 1], BRAND.trigo, BRAND.lino], "circle-stroke-width": 1.5, "circle-stroke-color": "#141a12" } },
    );
    if (me) {
      layers.push(
        { id: "me-halo", type: "circle", source: "me", paint: { "circle-radius": 18, "circle-color": BRAND.cielo, "circle-opacity": 0.3 } },
        { id: "me", type: "circle", source: "me", paint: { "circle-radius": 7, "circle-color": BRAND.cielo, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } },
      );
    }
    return { version: 8, sources, layers };
  }, [farms, plots, records, remoteBase, selected, me, lastVisit, mode]);

  if (!farm) {
    return (
      <View style={[st.center, { backgroundColor: C.papel }]}>
        <Text style={T.body}>{t("ui.loading")}</Text>
      </View>
    );
  }
  const plot = plots.find((p) => p.id === selected);
  const plotRecords = plot ? records.filter((r) => r.plotId === plot.id).slice(0, 3) : [];

  const copyMe = async () => {
    if (!me) return;
    if (await copyText(fixCoords(me))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const locate = async () => {
    const f = await currentFix(8000);
    if (!f) return;
    setMe(f);
    camera.current?.flyTo({ center: [f.lon, f.lat], zoom: 15, duration: 800 });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#141a12" }}>
      <Map
        style={{ flex: 1 }}
        mapStyle={style}
        attribution={false}
        logo={false}
        compass={false}
        onPress={(e) => {
          const [lon, lat] = e.nativeEvent.lngLat as unknown as [number, number];
          setSelected(plots.find((p) => containsPoint(JSON.parse(p.geometry) as Area, lon, lat))?.id ?? null);
        }}
      >
        <Camera ref={camera} initialViewState={{ bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat], padding: { top: 40, bottom: 40, left: 24, right: 24 } }} />
      </Map>
      <View style={st.topLeft} pointerEvents="box-none">
        <FarmLine style={st.panel} />
        <LayerSwitch value={mode} onChange={setMode} />
        {me && (
          <Pressable accessibilityRole="button" accessibilityLabel={`${formatFix(me)}. ${t("app.coordsCopy")}`} onPress={copyMe} style={st.coords}>
            <Text style={T.small}>{copied ? t("app.copied") : formatFix(me)}</Text>
          </Pressable>
        )}
        {mode === "ndvi" && <NdviLegend acquiredAt={ndvi?.acquiredAt ?? null} missing={!ndvi} />}
      </View>
      <Text style={st.attr}>Sentinel-2 · Copernicus</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t("app.whereAmI")} onPress={locate} style={st.locate}>
        <LocateFixed size={22} color={C.tinta} strokeWidth={2} />
      </Pressable>

      {canMarkPoi && !plot && (
        <View style={st.mark}>
          <Button kind="secondary" title={t("app.poiMark")} onPress={() => router.push("/poi")} />
        </View>
      )}

      {plot && (
        <View style={st.sheet}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={T.title}>{plot.name}</Text>
              <Text style={[T.small, { marginTop: 2 }]}>
                {plot.kind === "pasture" ? t("ui.pasture") : (plot.crop ?? t("ui.crop"))} · {t("ui.ha", { value: plot.areaHa.toLocaleString("es-PY", { maximumFractionDigits: 0 }) })}
                {lastVisit.get(plot.id)
                  ? ` · ${daysAgo(lastVisit.get(plot.id)!) === 0 ? t("app.lastVisitToday").toLowerCase() : t("app.lastVisit", { days: daysAgo(lastVisit.get(plot.id)!) }).toLowerCase()}`
                  : ` · ${t("app.noVisits").toLowerCase()}`}
              </Text>
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={12} accessibilityLabel={t("ui.close")}>
              <X size={22} color={C.tinta2} />
            </Pressable>
          </View>
          {plotRecords.map((r) => (
            <Text key={r.id} style={[T.small, { marginTop: 8 }]} numberOfLines={1}>
              {new Date(r.capturedAt).toLocaleDateString("es-PY", { day: "numeric", month: "short" })} · {describeRecord(r.kind, JSON.parse(r.data))}
            </Text>
          ))}
          <Button big title={t("app.annotateIn", { plot: plot.name })} onPress={() => router.push({ pathname: "/annotate", params: { plotId: plot.id } })} style={{ marginTop: 16 }} />
          <Button
            kind="text"
            title={t("app.gotoButton")}
            onPress={() => {
              const c = centroidOf(JSON.parse(plot.geometry) as Area);
              router.push({ pathname: "/goto", params: { lon: String(c.lon), lat: String(c.lat), name: plot.name } });
            }}
            style={{ marginTop: 4 }}
          />
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sheet: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: C.papel, borderRadius: RADIUS + 4, padding: GUTTER, elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  mark: { position: "absolute", left: 12, right: 12, bottom: 12 },
  locate: { position: "absolute", top: 16, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: C.papel, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  topLeft: { position: "absolute", top: 12, left: 12, right: 76, gap: 8 },
  coords: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  panel: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14 },
  attr: { position: "absolute", bottom: 6, left: 12, fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,0.7)" },
});
