/** Parte semanal en PDF (RF-80), generado en el navegador con @react-pdf/renderer (anexo §4.9). */
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View, Circle } from "@react-pdf/renderer";
import { BRAND } from "@yvy/shared";
import { describeData } from "./exports";
import { fmtDateTime, fmtHa, fmtIsoDate } from "./format";
import { t, tk } from "./i18n";
import type { Alert, Farm, Plot, RecordRow } from "./types";

export const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: BRAND.surco, fontFamily: "Helvetica" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  muted: { color: "#6B6F63" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DDD8C8", paddingVertical: 2.5 },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BRAND.surco,
    paddingBottom: 2,
    fontFamily: "Helvetica-Bold",
  },
  kpis: { flexDirection: "row", gap: 10, marginTop: 8 },
  kpi: { flex: 1, backgroundColor: BRAND.lino, padding: 6, borderRadius: 4 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photo: { width: 170, height: 128, objectFit: "cover", borderRadius: 3 },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#6B6F63",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function MiniMap({
  farm,
  plots,
  records,
  width = 539,
  height = 220,
}: {
  farm: Farm;
  plots: Plot[];
  records: RecordRow[];
  width?: number;
  height?: number;
}) {
  const [x0, y0, x1, y1] = [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat];
  const k = Math.min(width / (x1 - x0), height / (y1 - y0));
  const px = (lon: number) => (lon - x0) * k + (width - (x1 - x0) * k) / 2;
  const py = (lat: number) => (y1 - lat) * k + (height - (y1 - y0) * k) / 2;
  const path = (geom: string) => {
    const g = JSON.parse(geom) as { type: string; coordinates: number[][][] | number[][][][] };
    const polys = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
    return polys
      .map((rings) =>
        rings
          .map((r) => r.map((p, i) => `${i ? "L" : "M"}${px(p[0]!).toFixed(1)},${py(p[1]!).toFixed(1)}`).join("") + "Z")
          .join(""),
      )
      .join("");
  };
  return (
    <Svg width={width} height={height} style={{ backgroundColor: BRAND.lino, borderRadius: 4 }}>
      <Path d={path(farm.geometry)} stroke={BRAND.surco} strokeWidth={1.5} fill="none" />
      {plots.map((p) => (
        <Path
          key={p.id}
          d={path(p.geometry)}
          stroke={BRAND.soja}
          strokeWidth={0.8}
          fill={p.kind === "pasture" ? BRAND.trigo : BRAND.soja}
          fillOpacity={0.2}
        />
      ))}
      {records
        .filter((r) => r.lat !== null)
        .map((r) => (
          <Circle
            key={r.id}
            cx={px(r.lon!)}
            cy={py(r.lat!)}
            r={3}
            fill={BRAND.trigo}
            stroke={BRAND.surco}
            strokeWidth={0.6}
          />
        ))}
    </Svg>
  );
}

export interface ReportData {
  farm: Farm;
  plots: Plot[];
  records: RecordRow[];
  alerts: Alert[];
  rainMm: number | null;
  gaugeMm: number | null;
  from: string;
  to: string;
  photoUrls: string[];
}

export function WeeklyReport(d: ReportData) {
  const authors = new Set(d.records.map((r) => r.authorId)).size;
  return (
    <Document title={`${t("ui.reportTitle")} · ${d.farm.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.reportTitle")} · {d.farm.name}
        </Text>
        <Text style={s.muted}>
          {fmtIsoDate(d.from)} – {fmtIsoDate(d.to)} · {fmtHa(d.farm.areaHa)} · {d.plots.length}{" "}
          {t("ui.plots").toLowerCase()}
        </Text>
        <View style={s.kpis}>
          <View style={s.kpi}>
            <Text style={s.muted}>{t("ui.navRecords")}</Text>
            <Text style={s.kpiValue}>{d.records.length}</Text>
            <Text style={s.muted}>
              {authors} {t("ui.workers").toLowerCase()}
            </Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.muted}>{t("ui.rainWeek")}</Text>
            <Text style={s.kpiValue}>{d.rainMm === null ? "—" : `${Math.round(d.rainMm)} mm`}</Text>
            <Text style={s.muted}>
              {d.gaugeMm !== null ? `${t("ui.gauge")}: ${Math.round(d.gaugeMm)} mm` : t("ui.satelliteRain")}
            </Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.muted}>{t("ui.alertsTitle")}</Text>
            <Text style={s.kpiValue}>{d.alerts.length}</Text>
          </View>
        </View>
        <Text style={s.h2}>{t("ui.navRecords")}</Text>
        <MiniMap farm={d.farm} plots={d.plots} records={d.records} />
        <View style={{ marginTop: 8 }}>
          <View style={s.th}>
            <Text style={{ width: 62 }}>{t("ui.capturedAt")}</Text>
            <Text style={{ width: 70 }}>{t("ui.plot")}</Text>
            <Text style={{ width: 80 }}>{t("ui.author")}</Text>
            <Text style={{ flex: 1 }}>{t("ui.kind")}</Text>
          </View>
          {d.records.map((r) => (
            <View key={r.id} style={s.row} wrap={false}>
              <Text style={{ width: 62 }}>{fmtDateTime(r.capturedAt)}</Text>
              <Text style={{ width: 70 }}>{r.plotName ?? "—"}</Text>
              <Text style={{ width: 80 }}>{r.authorName ?? "—"}</Text>
              <Text style={{ flex: 1 }}>
                {tk(`recordKinds.${r.kind}`)}: {describeData(r.kind, r.data)}
              </Text>
            </View>
          ))}
        </View>
        {d.alerts.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>{t("ui.alertsTitle")}</Text>
            {d.alerts.map((a) => (
              <Text key={a.id}>
                • {tk(`ui.alertKind_${a.kind}`)} ({tk(`ui.severity_${a.severity}`)}): {a.summary}.{" "}
                {t("ui.orientative", { source: a.source })}
              </Text>
            ))}
          </View>
        )}
        {d.photoUrls.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>{t("ui.photos")}</Text>
            <View style={s.photos}>
              {d.photoUrls.slice(0, 6).map((u) => (
                <Image key={u} src={u} style={s.photo} />
              ))}
            </View>
          </View>
        )}
        <View style={s.footer} fixed>
          <Text>
            Yvy · {t("attribution.copernicus")} · {t("attribution.chirps")}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
