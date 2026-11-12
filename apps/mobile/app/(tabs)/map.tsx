/**
 * Mapa: satélite propio de la estancia (PMTiles local si se descargó), lotes, últimas anotaciones y "dónde estoy".
 * Tocar un lote abre su ficha abajo; desde ahí se anota en ese lote.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Camera, Map, Marker, type CameraRef, type StyleSpecification } from "@maplibre/maplibre-react-native";
import { router, useFocusEffect } from "expo-router";
import { Compass, LocateFixed, Navigation, X } from "lucide-react-native";
import { BRAND, describeRecord, t, uaPerHa } from "@yvy/shared";
import { centroidOf, containsPoint, labelPoint, samplingGrid, type Area } from "@yvy/geo";
import { distanceM } from "../../src/lib/bearing";
import { useRef } from "react";
import { mapBearingFor, shouldRotate } from "../../src/lib/heading";
import { useHeading } from "../../src/lib/useHeading";
import { useSession } from "../../src/lib/session";
import { isOwnerMode } from "../../src/lib/ownerSummary";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { copyText } from "../../src/lib/copy";
import { fixCoords, formatFix } from "../../src/lib/coords";
import { currentFix, type Fix } from "../../src/lib/location";
import { layerSource, tilesBaseUrl, type MapLayer } from "../../src/lib/offline";
import { setFabHidden } from "../../src/lib/fab";
import { useLocal } from "../../src/lib/useLocal";
import { FarmLine } from "../../src/ui/FarmLine";
import { LayerSwitch, NdviLegend } from "../../src/ui/MapLayerControls";
import { Button, Text } from "../../src/ui/kit";
import { C, F, GUTTER, RADIUS, T } from "../../src/ui/theme";

const FIT_PADDING = { top: 120, bottom: 40, left: 24, right: 24 };
const PLOT_PADDING = { top: 120, bottom: 320, left: 40, right: 40 };
const MAX_LABELS = 60;
const MAX_SAMPLES = 150;
const daysAgo = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000);

export default function MapScreen() {
  const { farmId: chosenFarm, current } = useFarmChoice();
  // F-29: dueño, administrador y agrónomo ven todos los lotes de todas las estancias; la estancia elegida solo mueve la cámara.
  const owner = isOwnerMode(useSession()?.organization.role);
  const farmId = owner ? null : chosenFarm;
  const farms = useLocal(() => byFarm(getDb().farms().map((f) => ({ ...f, farmId: f.id })), farmId), [farmId]);
  const plots = useLocal(() => byFarm(getDb().plots(), farmId), [farmId]);
  const records = useLocal(() => byFarm(getDb().records(300), farmId), [farmId]);
  const lastVisit = useLocal(() => getDb().lastVisitByPlot());
  const userId = useSession()?.user.id ?? "";
  const taskPoints = useLocal(() => getDb().taskPoints(userId), [userId]);
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
  // M-18: grilla de muestreo de suelo del lote elegido (hectáreas por punto), calculada en el celular
  const [gridHa, setGridHa] = useState<5 | 10 | null>(null);
  const [me, setMe] = useState<Fix | null>(null);
  const [copied, setCopied] = useState(false);
  const camera = useRef<CameraRef>(null);
  // F-04: brújula y mapa que gira con el rumbo (se activa a mano; el sensor solo corre mientras está activo).
  const [follow, setFollow] = useState(false);
  const [bearing, setBearing] = useState(0);
  const bearingRef = useRef(0);
  const heading = useHeading(follow);
  useEffect(() => {
    if (!follow || heading === null) return;
    const target = mapBearingFor(heading);
    if (!shouldRotate(bearingRef.current, target)) return;
    bearingRef.current = target;
    camera.current?.setStop({ bearing: target, duration: 250, easing: "linear" });
  }, [follow, heading]);
  const northUp = () => {
    setFollow(false);
    bearingRef.current = 0;
    camera.current?.setStop({ bearing: 0, duration: 300, easing: "ease" });
  };
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

  // M-12: la etiqueta va en un punto garantizado adentro del lote (el centro del bbox cae afuera en lotes en L o U).
  // Son vistas nativas: con muchos lotes solo se rotulan los de la estancia elegida y hasta MAX_LABELS.
  const labels = useMemo(
    () =>
      (farmId ? plots : plots.filter((p) => p.farmId === farm?.id))
        .slice(0, MAX_LABELS)
        .map((p) => ({ id: p.id, name: p.name, ...labelPoint(JSON.parse(p.geometry) as Area) })),
    [plots, farm?.id, farmId],
  );

  const samples = useMemo(() => {
    const p = plots.find((x) => x.id === selected);
    return p && gridHa ? samplingGrid(JSON.parse(p.geometry) as Area, gridHa).slice(0, MAX_SAMPLES) : [];
  }, [plots, selected, gridHa]);

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
    sources.tasks = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: taskPoints.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } })),
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
    layers.push({ id: "tasks", type: "circle", source: "tasks", paint: { "circle-radius": 9, "circle-color": BRAND.alerta, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } });
    if (me) {
      layers.push(
        { id: "me-halo", type: "circle", source: "me", paint: { "circle-radius": 18, "circle-color": BRAND.cielo, "circle-opacity": 0.3 } },
        { id: "me", type: "circle", source: "me", paint: { "circle-radius": 7, "circle-color": BRAND.cielo, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } },
      );
    }
    return { version: 8, sources, layers };
  }, [farms, plots, records, remoteBase, selected, me, lastVisit, mode, taskPoints]);

  if (!farm) {
    return (
      <View style={[st.center, { backgroundColor: C.papel }]}>
        <Text style={T.body}>{t("ui.loading")}</Text>
      </View>
    );
  }
  const plot = plots.find((p) => p.id === selected);
  const rainMonth = plot ? getDb().rainThisMonth(plot.farmId) : 0;
  const vigor = plot ? getDb().lastVigor(plot.id) : null;
  const openTasks = plot ? getDb().openTasksOfPlot(plot.id) : 0;
  // G-03: hacienda del potrero, calculada en el celular (anda sin señal).
  const herd = plot?.kind === "pasture" ? getDb().herdStock(plot.id) : null;
  const herdUa = plot && herd ? uaPerHa(herd.counts, plot.areaHa) : null;
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
        onRegionIsChanging={(e) => {
          const b = Math.round(e.nativeEvent.bearing);
          bearingRef.current = b;
          setBearing((prev) => (prev === b ? prev : b));
        }}
        onPress={(e) => {
          const [lon, lat] = e.nativeEvent.lngLat as unknown as [number, number];
          // Un toque cerca de una tarea con punto (S-09) lleva ahí
          const task = taskPoints.find((p) => distanceM({ lon, lat }, p) < 40);
          if (task) return router.push({ pathname: "/goto", params: { lon: String(task.lon), lat: String(task.lat), name: task.title } });
          setSelected(plots.find((p) => containsPoint(JSON.parse(p.geometry) as Area, lon, lat))?.id ?? null);
        }}
      >
        <Camera ref={camera} initialViewState={{ bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat], padding: { top: 40, bottom: 40, left: 24, right: 24 } }} />
        {samples.map((p) => (
          <Marker key={`s${p.n}`} lngLat={[p.lon, p.lat]}>
            <View style={st.sample} accessible accessibilityLabel={t("app.samplingPoint", { n: p.n })}>
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

      <View style={st.compassCol} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel={t("app.compassNorth")} onPress={northUp} style={st.round}>
          <View style={{ transform: [{ rotate: `${-bearing}deg` }] }}>
            <Compass size={22} color={C.tinta} strokeWidth={2} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: follow }}
          accessibilityLabel={follow ? t("app.compassFollowOff") : t("app.compassFollowOn")}
          onPress={() => setFollow((v) => !v)}
          style={[st.round, follow && { backgroundColor: C.accion }]}
        >
          <Navigation size={22} color={follow ? C.blanco : C.tinta} strokeWidth={2} />
        </Pressable>
      </View>

      {!plot && (
        <View style={st.mark}>
          <Button kind="secondary" title={t("app.poiScan")} onPress={() => router.push("/scan-poi")} />
          {canMarkPoi && <Button kind="secondary" title={t("app.poiMark")} onPress={() => router.push("/poi")} style={{ marginTop: 8 }} />}
          {canMarkPoi && <Button kind="secondary" title={t("app.plotDrawStart")} onPress={() => router.push("/plot-draw")} style={{ marginTop: 8 }} />}
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
          {herd && (
            <Text style={[T.smallMedium, { marginTop: 10 }]}>
              {t("app.plotHerd", { n: herd.total })}
              {herdUa !== null ? ` · ${t("app.plotHerdUa", { v: herdUa.toLocaleString("es-PY", { maximumFractionDigits: 2 }) })}` : ""}
            </Text>
          )}
          {(rainMonth > 0 || vigor || openTasks > 0) && (
            <View style={{ marginTop: 10, gap: 2 }}>
              {rainMonth > 0 && <Text style={T.smallMedium}>{t("app.plotRainMonth", { mm: Math.round(rainMonth) })}</Text>}
              {vigor && (
                <Text style={T.smallMedium}>
                  {t("app.plotVigor", { value: vigor.mean.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), date: new Date(vigor.acquiredAt).toLocaleDateString("es-PY", { day: "numeric", month: "short" }) })}
                </Text>
              )}
              {openTasks > 0 && <Text style={T.smallMedium}>{t("app.plotOpenTasks", { n: openTasks })}</Text>}
            </View>
          )}
          {plotRecords.map((r) => (
            <Text key={r.id} style={[T.small, { marginTop: 8 }]} numberOfLines={1}>
              {new Date(r.capturedAt).toLocaleDateString("es-PY", { day: "numeric", month: "short" })} · {describeRecord(r.kind, JSON.parse(r.data))}
            </Text>
          ))}
          <Button big title={t("app.annotateIn", { plot: plot.name })} onPress={() => router.push({ pathname: "/annotate", params: { plotId: plot.id } })} style={{ marginTop: 16 }} />
          <Button
            kind="text"
            title={gridHa === null ? t("app.samplingShow5") : gridHa === 5 ? t("app.samplingShow10") : t("app.samplingHide")}
            onPress={() => setGridHa(gridHa === null ? 5 : gridHa === 5 ? 10 : null)}
            style={{ marginTop: 4 }}
          />
          {gridHa !== null && <Text style={T.small}>{t("app.samplingInfo", { n: samples.length })}</Text>}
          {canMarkPoi && (
            <Button kind="text" title={t("app.plotDrawEdit")} onPress={() => router.push({ pathname: "/plot-draw", params: { plotId: plot.id } })} style={{ marginTop: 4 }} />
          )}
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
  compassCol: { position: "absolute", top: 76, right: 16, gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.papel, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  topLeft: { position: "absolute", top: 12, left: 12, right: 76, gap: 8 },
  coords: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  panel: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14 },
  label: { fontFamily: F.sansMedium, fontSize: 12, color: "#ffffff", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 }, maxWidth: 110 },
  sample: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: "#D9A93A", borderWidth: 2, borderColor: "#1E2419", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  sampleText: { fontFamily: F.sansMedium, fontSize: 11, color: "#1E2419" },
  attr: { position: "absolute", bottom: 6, left: 12, fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,0.7)" },
});
