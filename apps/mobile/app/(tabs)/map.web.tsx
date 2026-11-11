// Vista previa web del mapa de la app: MapLibre GL JS con el mismo estilo que MapLibre Native.
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { FarmLine } from "../../src/ui/FarmLine";
import { Button } from "../../src/ui/kit";
import { LayerSwitch, NdviLegend } from "../../src/ui/MapLayerControls";
import { StyleSheet, Text, View } from "react-native";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { BRAND, t } from "@yvy/shared";
import { containsPoint, type Area } from "@yvy/geo";
import { getDb } from "../../src/lib/db";
import { byFarm, useFarmChoice } from "../../src/lib/farmFilter";
import { layerSource, tilesBaseUrl, type MapLayer } from "../../src/lib/offline";
import { setFabHidden } from "../../src/lib/fab";
import { useLocal } from "../../src/lib/useLocal";
import { C, RADIUS, T } from "../../src/ui/theme";

let protocol = false;

export default function MapScreen() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { farmId, current } = useFarmChoice();
  const farms = useLocal(() => byFarm(getDb().farms().map((f) => ({ ...f, farmId: f.id })), farmId), [farmId]);
  const plots = useLocal(() => byFarm(getDb().plots(), farmId), [farmId]);
  const records = useLocal(() => byFarm(getDb().records(300), farmId), [farmId]);
  const [base, setBase] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setFabHidden(!!selected);
      return () => setFabHidden(false);
    }, [selected]),
  );
  const farm = current ?? farms[0];
  const [mode, setModeState] = useState<MapLayer>(() => (getDb().getKv("map_layer") === "ndvi" ? "ndvi" : "true_color"));
  const setMode = (m: MapLayer) => {
    setModeState(m);
    getDb().setKv("map_layer", m);
  };
  const ndvi = farm && mode === "ndvi" ? layerSource(farm.id, "ndvi", base) : null;
  useEffect(() => {
    tilesBaseUrl().then(setBase, () => setBase(null));
  }, []);

  useEffect(() => {
    if (!ref.current || !farm) return;
    if (!protocol) {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      protocol = true;
    }
    const layer = layerSource(farm.id, mode, base);
    const fc = (features: GeoJSON.Feature[]) => ({ type: "FeatureCollection" as const, features });
    const map = new maplibregl.Map({
      container: ref.current,
      attributionControl: false,
      bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat],
      fitBoundsOptions: { padding: 24 },
      style: {
        version: 8,
        sources: {
          ...(layer
            ? { base: { type: "raster" as const, url: layer.url, tileSize: 256 } }
            : {}),
          farms: {
            type: "geojson",
            data: fc(farms.map((f) => ({ type: "Feature", properties: {}, geometry: JSON.parse(f.geometry) }))),
          },
          plots: {
            type: "geojson",
            data: fc(
              plots.map((p) => ({
                type: "Feature",
                properties: { kind: p.kind, sel: p.id === selected ? 1 : 0 },
                geometry: JSON.parse(p.geometry),
              })),
            ),
          },
          records: {
            type: "geojson",
            data: fc(
              records
                .filter((r) => r.lat !== null)
                .map((r) => ({
                  type: "Feature",
                  properties: { pending: r.pending ? 1 : 0 },
                  geometry: { type: "Point", coordinates: [r.lon!, r.lat!] },
                })),
            ),
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#141a12" } },
          ...(layer ? [{ id: "base", type: "raster" as const, source: "base" }] : []),
          { id: "farms", type: "line", source: "farms", paint: { "line-color": "rgba(255,255,255,0.9)", "line-width": 2 } },
          { id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": "#ffffff", "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.28, 0.04] } },
          {
            id: "plots-line",
            type: "line",
            source: "plots",
            paint: {
              "line-color": ["case", ["==", ["get", "sel"], 1], "#ffffff", "rgba(255,255,255,0.7)"],
              "line-width": ["case", ["==", ["get", "sel"], 1], 3, 1.5],
            },
          },
          {
            id: "records",
            type: "circle",
            source: "records",
            paint: {
              "circle-radius": 5,
              "circle-color": ["case", ["==", ["get", "pending"], 1], BRAND.trigo, BRAND.lino],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#141a12",
            },
          },
        ],
      },
    });
    map.on("click", (e) =>
      setSelected(
        plots.find((p) => containsPoint(JSON.parse(p.geometry) as Area, e.lngLat.lng, e.lngLat.lat))?.id ?? null,
      ),
    );
    for (const p of plots) {
      const el = document.createElement("div");
      el.textContent = p.name;
      Object.assign(el.style, {
        font: "600 13px Inter_600SemiBold, Inter, system-ui, sans-serif",
        color: "#fff",
        textShadow: "0 1px 3px rgba(0,0,0,.9), 0 0 8px rgba(0,0,0,.5)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      });
      new maplibregl.Marker({ element: el })
        .setLngLat([(p.minLon + p.maxLon) / 2, (p.minLat + p.maxLat) / 2])
        .addTo(map);
    }
    return () => map.remove();
  }, [farm?.id, plots, records, base, selected, mode]);

  const plot = plots.find((p) => p.id === selected);
  return (
    <View style={{ flex: 1, backgroundColor: "#141a12" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <View style={s.topLeft} pointerEvents="box-none">
        <FarmLine style={s.panel} />
        <LayerSwitch value={mode} onChange={setMode} />
        {mode === "ndvi" && <NdviLegend acquiredAt={ndvi?.acquiredAt ?? null} missing={!ndvi} />}
      </View>
      {plot && (
        <View style={s.sheet}>
          <Text style={s.title}>{plot.name}</Text>
          <Text style={s.sub}>
            {plot.kind === "pasture" ? t("ui.pasture") : (plot.crop ?? t("ui.crop"))} · {t("ui.ha", { value: plot.areaHa.toLocaleString("es-PY", { maximumFractionDigits: 0 }) })}
          </Text>
          <Button big title={t("app.annotateIn", { plot: plot.name })} onPress={() => router.push({ pathname: "/annotate", params: { plotId: plot.id } })} style={{ marginTop: 16 }} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topLeft: { position: "absolute", top: 12, left: 12, right: 12, gap: 8 },
  panel: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14 },
  sheet: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: C.papel, borderRadius: 16, padding: 20 },
  title: { ...T.title },
  sub: { ...T.small, marginTop: 2 },
});
