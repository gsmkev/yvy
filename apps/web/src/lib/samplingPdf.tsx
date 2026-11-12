/** Grilla de muestreo de suelo (M-18) para imprimir: croquis del lote con los puntos numerados y la tabla de coordenadas. */
import { Circle, Document, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import { BRAND } from "@yvy/shared";
import { bboxOf, type Area, type SamplePoint } from "@yvy/geo";
import { fmtDate, fmtHa } from "./format";
import { t } from "./i18n";
import { s } from "./reportPdf";
import type { Farm, Plot } from "./types";

export interface SamplingPdfData {
  farm: Farm;
  plot: Plot;
  haPerPoint: number;
  points: SamplePoint[];
  generatedAt: number;
}

type Geo = { type: string; coordinates: number[][][] | number[][][][] };

/** Proyección simple del croquis (equirectangular local) que se comparte con la pantalla. */
export function projector(plot: Plot, width: number, height: number) {
  const b = bboxOf(JSON.parse(plot.geometry) as Area);
  const [x0, y0, x1, y1] = [b.minLon, b.minLat, b.maxLon, b.maxLat];
  const mLon = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const w = (x1 - x0) * mLon || 1e-9;
  const h = y1 - y0 || 1e-9;
  const k = Math.min((width - 16) / w, (height - 16) / h);
  const ox = (width - w * k) / 2;
  const oy = (height - h * k) / 2;
  return { px: (lon: number) => ox + (lon - x0) * mLon * k, py: (lat: number) => oy + (y1 - lat) * k };
}

export function plotPath(plot: Plot, px: (lon: number) => number, py: (lat: number) => number): string {
  const g = JSON.parse(plot.geometry) as Geo;
  const polys = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
  return polys
    .map((rings) => rings.map((r) => r.map((p, i) => `${i ? "L" : "M"}${px(p[0]!).toFixed(1)},${py(p[1]!).toFixed(1)}`).join("") + "Z").join(""))
    .join("");
}

const COL = { n: 40, lon: 110, lat: 110 };

export function SamplingReport({ farm, plot, haPerPoint, points, generatedAt }: SamplingPdfData) {
  const W = 539;
  const H = 360;
  const { px, py } = projector(plot, W, H);
  return (
    <Document title={`${t("ui.samplingTitle")} · ${plot.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.samplingTitle")} · {plot.name}
        </Text>
        <Text style={s.muted}>
          {farm.name} · {fmtHa(plot.areaHa)} · {t("ui.samplingPerPoint", { ha: haPerPoint })} · {t("ui.samplingCount", { n: points.length })} ·{" "}
          {t("ui.sharedGenerated", { date: fmtDate(generatedAt) })}
        </Text>
        <View style={{ marginTop: 8 }}>
          <Svg width={W} height={H} style={{ backgroundColor: BRAND.lino, borderRadius: 4 }}>
            <Path d={plotPath(plot, px, py)} stroke={BRAND.surco} strokeWidth={1.5} fill={BRAND.soja} fillOpacity={0.12} />
            {points.map((p) => (
              <Circle key={p.n} cx={px(p.lon)} cy={py(p.lat)} r={5} fill={BRAND.trigo} stroke={BRAND.surco} strokeWidth={0.8} />
            ))}
            {points.map((p) => (
              <Text key={`t${p.n}`} x={px(p.lon) + 7} y={py(p.lat) + 3} style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>
                {String(p.n)}
              </Text>
            ))}
          </Svg>
        </View>
        <Text style={[s.muted, { marginTop: 4 }]}>{t("ui.samplingHow")}</Text>
        <Text style={s.h2}>{t("ui.samplingTable")}</Text>
        <View style={s.th}>
          <Text style={{ width: COL.n }}>{t("ui.samplingColN")}</Text>
          <Text style={{ width: COL.lat }}>{t("ui.samplingColLat")}</Text>
          <Text style={{ width: COL.lon }}>{t("ui.samplingColLon")}</Text>
          <Text style={{ flex: 1 }}>{t("ui.samplingColNote")}</Text>
        </View>
        {points.map((p) => (
          <View key={p.n} style={s.row} wrap={false}>
            <Text style={{ width: COL.n }}>{p.n}</Text>
            <Text style={{ width: COL.lat }}>{p.lat.toFixed(6)}</Text>
            <Text style={{ width: COL.lon }}>{p.lon.toFixed(6)}</Text>
            <Text style={{ flex: 1 }}> </Text>
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>{t("ui.samplingFooter")}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
