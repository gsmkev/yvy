// Vista previa web del mapa de la app: MapLibre GL JS con el mismo estilo que MapLibre Native.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { BRAND, t } from "@yvy/shared";
import { containsPoint, type Area } from "@yvy/geo";
import { getDb } from "../../src/lib/db";
import { tilesBaseUrl } from "../../src/lib/offline";
import { useLocal } from "../../src/lib/useLocal";
import { C, MONO } from "../../src/ui/theme";

let protocol = false;

export default function MapScreen() {
  const ref = useRef<HTMLDivElement | null>(null);
  const farms = useLocal(() => getDb().farms());
  const plots = useLocal(() => getDb().plots());
  const records = useLocal(() => getDb().records(300));
  const [base, setBase] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const farm = farms[0];
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
    const layer = getDb()
      .latestLayers(farm.id)
      .find((l) => l.layer === "true_color");
    const fc = (features: GeoJSON.Feature[]) => ({ type: "FeatureCollection" as const, features });
    const map = new maplibregl.Map({
      container: ref.current,
      attributionControl: false,
      bounds: [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat],
      fitBoundsOptions: { padding: 24 },
      style: {
        version: 8,
        sources: {
          ...(layer && base
            ? { base: { type: "raster" as const, url: `pmtiles://${base}/${layer.pmtilesPath}`, tileSize: 256 } }
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
          { id: "bg", type: "background", paint: { "background-color": BRAND.surco } },
          ...(layer && base ? [{ id: "base", type: "raster" as const, source: "base" }] : []),
          { id: "farms", type: "line", source: "farms", paint: { "line-color": BRAND.lino, "line-width": 2.5 } },
          {
            id: "plots-fill",
            type: "fill",
            source: "plots",
            paint: {
              "fill-color": ["match", ["get", "kind"], "pasture", BRAND.trigo, BRAND.soja],
              "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.45, 0.15],
            },
          },
          {
            id: "plots-line",
            type: "line",
            source: "plots",
            paint: { "line-color": ["case", ["==", ["get", "sel"], 1], BRAND.lino, BRAND.soja], "line-width": 2 },
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
        font: "500 11px monospace",
        color: "#fff",
        background: "rgba(30,36,25,.72)",
        padding: "1px 6px",
        borderRadius: "3px",
        pointerEvents: "none",
      });
      new maplibregl.Marker({ element: el })
        .setLngLat([(p.minLon + p.maxLon) / 2, (p.minLat + p.maxLat) / 2])
        .addTo(map);
    }
    return () => map.remove();
  }, [farm?.id, plots, records, base, selected]);

  const plot = plots.find((p) => p.id === selected);
  return (
    <View style={{ flex: 1 }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {plot && (
        <View style={s.sheet}>
          <Text style={s.eyebrow}>{plot.kind === "crop" ? t("ui.crop") : t("ui.pasture")}</Text>
          <Text style={s.title}>{plot.name}</Text>
          <Text style={s.sub}>
            {t("ui.ha", { value: plot.areaHa.toLocaleString("es-PY", { maximumFractionDigits: 1 }) })}
            {plot.crop ? ` · ${plot.crop}` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: C.papel,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.linea,
  },
  eyebrow: { ...MONO, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.tinta2 },
  title: { fontSize: 22, fontWeight: "700", color: C.surco },
  sub: { ...MONO, color: C.tinta2, marginTop: 2, fontSize: 14 },
});
