/** Indicador EUDR en PDF, con los estilos del parte semanal. Análisis indicativo, no una certificación. */
import { Document, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import { BRAND, ATTRIBUTION } from "@yvy/shared";
import { changeAreas, EUDR_METHOD, fmtRatio, statusText, summarize } from "./eudrData";
import { fmtDate, fmtHa } from "./format";
import { t } from "./i18n";
import { s } from "./reportPdf";
import { Kpi } from "./reportsPdf";
import type { EudrResponse, Farm, Plot } from "./types";

interface EudrReportData {
  farm: Farm;
  data: EudrResponse;
  plots: Plot[];
  generatedAt: number;
}

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>{t("ui.eudr.footer")}</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

type Geo = { type: string; coordinates: number[][][] | number[][][][] };

/** Mapa esquemático: perímetro, lotes y áreas con posible pérdida (relleno de alerta). */
export function ChangeMap({ farm, plots, areas, width = 539, height = 260 }: { farm: Farm; plots: Plot[]; areas: { id: string; geometry: string }[]; width?: number; height?: number }) {
  const [x0, y0, x1, y1] = [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat];
  const k = Math.min(width / (x1 - x0), height / (y1 - y0));
  const px = (lon: number) => (lon - x0) * k + (width - (x1 - x0) * k) / 2;
  const py = (lat: number) => (y1 - lat) * k + (height - (y1 - y0) * k) / 2;
  const path = (geom: string) => {
    const g = JSON.parse(geom) as Geo;
    const polys = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
    return polys
      .map((rings) =>
        rings.map((r) => r.map((p, i) => `${i ? "L" : "M"}${px(p[0]!).toFixed(1)},${py(p[1]!).toFixed(1)}`).join("") + "Z").join(""),
      )
      .join("");
  };
  return (
    <Svg width={width} height={height} style={{ backgroundColor: BRAND.lino, borderRadius: 4 }}>
      <Path d={path(farm.geometry)} stroke={BRAND.surco} strokeWidth={1.5} fill="none" />
      {plots.map((p) => (
        <Path key={p.id} d={path(p.geometry)} stroke={BRAND.soja} strokeWidth={0.8} fill={BRAND.soja} fillOpacity={0.15} />
      ))}
      {areas.map((a) => (
        <Path key={a.id} d={path(a.geometry)} stroke={BRAND.alerta} strokeWidth={0.8} fill={BRAND.alerta} fillOpacity={0.55} />
      ))}
    </Svg>
  );
}

export function EudrReport({ farm, data, plots, generatedAt }: EudrReportData) {
  const sum = summarize(data);
  const refYear = sum.refYear ?? 2020;
  const curYear = sum.curYear ?? new Date(generatedAt).getFullYear();
  const m = EUDR_METHOD;
  const range = (from: number | null, to: number | null) => (from === null || to === null ? ["—", "—"] : [fmtDate(from), fmtDate(to)]);
  const r = range(sum.refFromAt, sum.refToAt);
  const c = range(sum.curFromAt, sum.curToAt);
  const areas = changeAreas(data.plots);
  return (
    <Document title={`${t("ui.eudr.title")} · ${farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.eudr.title")} · {farm.name}
        </Text>
        <Text style={s.muted}>
          {[farm.department, farm.district].filter(Boolean).join(", ")}
          {farm.department || farm.district ? " · " : ""}
          {fmtHa(farm.areaHa)} · {t("ui.shared.generated", { date: fmtDate(generatedAt) })}
          {data.computedAt !== null ? " · " + t("ui.eudr.computed", { date: fmtDate(data.computedAt) }) : ""}
        </Text>

        <View style={{ marginTop: 8, borderLeftWidth: 2, borderLeftColor: BRAND.trigo, paddingLeft: 6 }}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{t("ui.eudr.disclaimerTitle")}</Text>
          <Text>{t("ui.eudr.disclaimer")}</Text>
        </View>

        <View style={s.kpis}>
          <Kpi label={t("ui.eudr.forest", { year: refYear })} value={fmtHa(sum.forestRefHa)} />
          <Kpi label={t("ui.eudr.loss")} value={fmtHa(sum.lossHa)} />
          <Kpi label={t("ui.eudr.plotsWithLoss")} value={`${sum.withLoss} / ${sum.plots}`} />
        </View>
        <Text style={[s.muted, { marginTop: 6 }]}>{t("ui.eudr.refComposite", { year: refYear, from: r[0]!, to: r[1]!, n: sum.refScenes })}</Text>
        <Text style={s.muted}>{t("ui.eudr.curComposite", { year: curYear, from: c[0]!, to: c[1]!, n: sum.curScenes })}</Text>

        <Text style={s.h2}>{t("ui.eudr.mapTitle")}</Text>
        <ChangeMap farm={farm} plots={plots} areas={areas} />
        {areas.length === 0 && <Text style={s.muted}>{t("ui.eudr.mapNone")}</Text>}

        <Text style={s.h2}>{t("ui.eudr.plotsTitle")}</Text>
        <View style={s.th}>
          <Text style={{ width: 120 }}>{t("ui.eudr.colPlot")}</Text>
          <Text style={{ width: 70 }}>{t("ui.eudr.colArea")}</Text>
          <Text style={{ width: 90 }}>{t("ui.eudr.colForest", { year: refYear })}</Text>
          <Text style={{ flex: 1 }}>{t("ui.eudr.colResult")}</Text>
        </View>
        {data.plots.map((p) => (
          <View key={p.plotId} style={s.row} wrap={false}>
            <Text style={{ width: 120 }}>{p.plotName}</Text>
            <Text style={{ width: 70 }}>{fmtHa(p.plotAreaHa)}</Text>
            <Text style={{ width: 90 }}>{p.status === "no_data" ? "—" : fmtHa(p.forestRefHa)}</Text>
            <Text style={{ flex: 1 }}>{statusText(p.status, p.lossHa)}</Text>
          </View>
        ))}

        <View wrap={false}>
          <Text style={s.h2}>{t("ui.eudr.methodTitle")}</Text>
          <Text>{t("ui.eudr.methodSource")}</Text>
          <Text style={{ marginTop: 3 }}>{t("ui.eudr.methodComposite", { ref: refYear, cur: curYear })}</Text>
          <Text style={{ marginTop: 3 }}>
            {t("ui.eudr.methodRule", {
              ndvi: fmtRatio(m.forestNdviMin),
              ndmi: fmtRatio(m.forestNdmiMin),
              ref: refYear,
              loss: fmtRatio(m.lossNdviMax),
              drop: fmtRatio(m.lossNdviDrop),
              min: fmtRatio(m.minPatchHa),
            })}
          </Text>
          <Text style={{ marginTop: 3 }}>{t("ui.eudr.methodLimits")}</Text>
          <Text style={[s.muted, { marginTop: 3 }]}>{t(ATTRIBUTION.copernicus)}.</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
