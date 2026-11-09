import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Camera, Map, type StyleSpecification } from "@maplibre/maplibre-react-native";
import { BRAND, t } from "@yvy/shared";
import { containsPoint, type Area } from "@yvy/geo";
import { getDb } from "../../src/lib/db";
import { packStatus, tilesBaseUrl } from "../../src/lib/offline";
import { useLocal } from "../../src/lib/useLocal";
import { Muted } from "../../src/ui/kit";
import { C } from "../../src/ui/theme";

export default function MapScreen() {
  const farms = useLocal(() => getDb().farms());
  const plots = useLocal(() => getDb().plots());
  const pois = useLocal(() => getDb().pois());
  const records = useLocal(() => getDb().records(300));
  const [remoteBase, setRemoteBase] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const farm = farms[0];
  useEffect(() => {
    tilesBaseUrl().then(setRemoteBase, () => setRemoteBase(null));
  }, []);

  const style = useMemo<StyleSpecification>(() => {
    const sources: StyleSpecification["sources"] = {};
    const layers: StyleSpecification["layers"] = [
      { id: "bg", type: "background", paint: { "background-color": BRAND.surco } },
    ];
    for (const f of farms) {
      const pack = packStatus(f.id);
      const local = pack.localUri("true_color");
      const remote = pack.layers.find((l) => l.layer === "true_color");
      const url = local
        ? `pmtiles://${local}`
        : remote && remoteBase
          ? `pmtiles://${remoteBase.replace(/\/$/, "")}/${remote.pmtilesPath}`
          : null;
      if (url) {
        sources[`base-${f.id}`] = { type: "raster", url, tileSize: 256 };
        layers.push({ id: `base-${f.id}`, type: "raster", source: `base-${f.id}` });
      }
    }
    sources.farms = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: farms.map((f) => ({ type: "Feature", properties: {}, geometry: JSON.parse(f.geometry) })),
      },
    };
    sources.plots = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: plots.map((p) => ({
          type: "Feature",
          properties: { id: p.id, sel: p.id === selected ? 1 : 0, kind: p.kind },
          geometry: JSON.parse(p.geometry),
        })),
      },
    };
    sources.pois = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: pois.map((p) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        })),
      },
    };
    sources.records = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: records
          .filter((r) => r.lat !== null)
          .map((r) => ({
            type: "Feature",
            properties: { pending: r.pending ? 1 : 0 },
            geometry: { type: "Point", coordinates: [r.lon!, r.lat!] },
          })),
      },
    };
    layers.push(
      { id: "farms", type: "line", source: "farms", paint: { "line-color": BRAND.lino, "line-width": 2.5 } },
      {
        id: "plots-fill",
        type: "fill",
        source: "plots",
        paint: {
          "fill-color": ["match", ["get", "kind"], "pasture", BRAND.trigo, BRAND.soja],
          "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.45, 0.2],
        },
      },
      {
        id: "plots-line",
        type: "line",
        source: "plots",
        paint: { "line-color": ["case", ["==", ["get", "sel"], 1], BRAND.lino, BRAND.soja], "line-width": 2 },
      },
      {
        id: "pois",
        type: "circle",
        source: "pois",
        paint: {
          "circle-radius": 7,
          "circle-color": BRAND.cielo,
          "circle-stroke-width": 2,
          "circle-stroke-color": BRAND.surco,
        },
      },
      {
        id: "records",
        type: "circle",
        source: "records",
        paint: {
          "circle-radius": 6,
          "circle-color": ["case", ["==", ["get", "pending"], 1], BRAND.trigo, BRAND.soja],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": BRAND.lino,
        },
      },
    );
    return { version: 8, sources, layers };
  }, [farms, plots, pois, records, remoteBase, selected]);

  if (!farm)
    return (
      <View style={s.empty}>
        <Muted>{t("ui.loading")}</Muted>
      </View>
    );
  const plot = plots.find((p) => p.id === selected);
  return (
    <View style={{ flex: 1 }}>
      <Map
        style={{ flex: 1 }}
        mapStyle={style}
        attribution={false}
        logo={false}
        onPress={(e) => {
          const [lon, lat] = e.nativeEvent.lngLat as unknown as [number, number];
          setSelected(plots.find((p) => containsPoint(JSON.parse(p.geometry) as Area, lon, lat))?.id ?? null);
        }}
      >
        <Camera
          initialViewState={{
            bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat],
            padding: { top: 30, bottom: 30, left: 30, right: 30 },
          }}
        />
      </Map>
      {plot && (
        <View style={s.sheet}>
          <Text style={s.title}>{plot.name}</Text>
          <Text style={s.sub}>
            {t("ui.ha", { value: plot.areaHa.toFixed(1) })} ·{" "}
            {plot.kind === "crop" ? (plot.crop ?? t("ui.crop")) : t("ui.pasture")}
          </Text>
        </View>
      )}
      <Text style={s.attr}>{t("attribution.copernicus")}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: C.surco },
  sub: { color: C.muted, marginTop: 2, fontSize: 15 },
  attr: { position: "absolute", top: 6, right: 8, fontSize: 9, color: C.lino, opacity: 0.8 },
});
