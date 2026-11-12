/** Informe de daños para el seguro agrícola en PDF (C-09), con los estilos del parte semanal. Evidencia, no un peritaje. */
import { Document, Image, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import { BRAND } from "@yvy/shared";
import { damageSatellite, type DamageCause, type DamageEvidence, type NdviPass } from "./damageData";
import { describeData } from "./exports";
import { fmtDate, fmtDateTime, fmtHa, fmtIsoDate, fmtNdvi, fmtNum } from "./format";
import { t, tk } from "./i18n";
import { s } from "./reportPdf";
import { Kpi } from "./reportsPdf";
import type { Farm, Plot } from "./types";

export interface DamageReportData {
  farm: Farm;
  plot: Plot;
  eventDay: string;
  cause: DamageCause;
  description: string;
  series: NdviPass[];
  evidence: DamageEvidence;
  photoUrls: string[];
  generatedAt: number;
  author: string;
}

type Geo = { type: string; coordinates: number[][][] | number[][][][] };

/** Mapa esquemático del lote dentro de la estancia y los puntos GPS de los registros. */
function PlotMap({ farm, plot, points, width = 250, height = 170 }: { farm: Farm; plot: Plot; points: { lon: number; lat: number }[]; width?: number; height?: number }) {
  const [x0, y0, x1, y1] = [farm.minLon, farm.minLat, farm.maxLon, farm.maxLat];
  const k = Math.min(width / (x1 - x0), height / (y1 - y0));
  const px = (lon: number) => (lon - x0) * k + (width - (x1 - x0) * k) / 2;
  const py = (lat: number) => (y1 - lat) * k + (height - (y1 - y0) * k) / 2;
  const path = (geom: string) => {
    const g = JSON.parse(geom) as Geo;
    const polys = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
    return polys.map((rings) => rings.map((r) => r.map((p, i) => `${i ? "L" : "M"}${px(p[0]!).toFixed(1)},${py(p[1]!).toFixed(1)}`).join("") + "Z").join("")).join("");
  };
  return (
    <Svg width={width} height={height} style={{ backgroundColor: BRAND.lino, borderRadius: 4 }}>
      <Path d={path(farm.geometry)} stroke={BRAND.surco} strokeWidth={1} fill="none" />
      <Path d={path(plot.geometry)} stroke={BRAND.alerta} strokeWidth={1.2} fill={BRAND.alerta} fillOpacity={0.25} />
      {points.map((p, i) => (
        <Path key={i} d={`M${px(p.lon) - 2.5},${py(p.lat)}h5`} stroke={BRAND.surco} strokeWidth={2} />
      ))}
    </Svg>
  );
}

/** Curva del NDVI del lote con una marca en el día del evento. */
function NdviLine({ series, eventMs, width = 270, height = 120 }: { series: NdviPass[]; eventMs: number; width?: number; height?: number }) {
  if (series.length === 0) return null;
  const xs = [...series.map((p) => p.acquiredAt), eventMs];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const sx = (x: number) => 4 + ((x - x0) / Math.max(x1 - x0, 1)) * (width - 8);
  const sy = (v: number) => height - 6 - Math.min(1, Math.max(0, v)) * (height - 12);
  const d = series.map((p, i) => `${i ? "L" : "M"}${sx(p.acquiredAt).toFixed(1)},${sy(p.mean).toFixed(1)}`).join("");
  return (
    <Svg width={width} height={height} style={{ backgroundColor: BRAND.lino, borderRadius: 4 }}>
      <Path d={`M${sx(eventMs).toFixed(1)},2V${height - 2}`} stroke={BRAND.alerta} strokeWidth={1} />
      <Path d={d} stroke={BRAND.soja} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>{t("ui.damageFooter")}</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

export function DamageReport(d: DamageReportData) {
  const sat = damageSatellite(d.series, d.eventDay);
  const eventMs = Date.parse(`${d.eventDay}T12:00:00-03:00`);
  const gps = d.evidence.records.filter((r) => r.lon !== null && r.lat !== null).map((r) => ({ lon: r.lon!, lat: r.lat! }));
  const pass = (p: NdviPass | null) => (p ? `${fmtNdvi(p.mean)} · ${fmtDate(p.acquiredAt)}` : "—");
  return (
    <Document title={`${t("ui.damageTitle")} · ${d.plot.name}`} author="Yvy" language="es-PY">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {t("ui.damageTitle")} · {d.plot.name}
        </Text>
        <Text style={s.muted}>
          {d.farm.name}
          {[d.farm.department, d.farm.district].filter(Boolean).length ? ` · ${[d.farm.department, d.farm.district].filter(Boolean).join(", ")}` : ""} ·{" "}
          {fmtHa(d.plot.areaHa)} · {d.plot.crop ? tk(`fields.crop_${d.plot.crop}`) : t("ui.crop")}
          {d.plot.sowingDate ? ` · ${t("ui.rotationSown", { date: fmtIsoDate(d.plot.sowingDate) })}` : ""}
        </Text>
        <Text style={s.muted}>{t("ui.damageGenerated", { date: fmtDateTime(d.generatedAt), by: d.author })}</Text>

        <View style={s.kpis}>
          <Kpi label={t("ui.damageEventDate")} value={fmtIsoDate(d.eventDay)} />
          <Kpi label={t("ui.damageCause")} value={tk(`ui.damageCause_${d.cause}`)} />
          <Kpi label={t("ui.damageNdviChange")} value={sat.changePct === null ? "—" : `${fmtNum(sat.changePct)} %`} />
        </View>
        {d.description.trim() !== "" && (
          <>
            <Text style={s.h2}>{t("ui.damageDescription")}</Text>
            <Text>{d.description.trim()}</Text>
          </>
        )}

        <Text style={s.h2}>{t("ui.damageSatellite")}</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text>
              {t("ui.damageBefore")}: <Text style={{ fontFamily: "Helvetica-Bold" }}>{pass(sat.before)}</Text>
            </Text>
            <Text>
              {t("ui.damageAfter")}: <Text style={{ fontFamily: "Helvetica-Bold" }}>{pass(sat.after)}</Text>
            </Text>
            {(!sat.before || !sat.after) && <Text style={s.muted}>{t("ui.damageNoPass")}</Text>}
            <Text style={s.muted}>{t("ui.damageSatelliteNote")}</Text>
          </View>
          <NdviLine series={sat.series} eventMs={eventMs} />
        </View>
        <Text style={[s.muted, { marginTop: 3 }]}>{t("attribution.copernicus")}.</Text>

        <Text style={s.h2}>{t("ui.damageLocation")}</Text>
        <PlotMap farm={d.farm} plot={d.plot} points={gps} />

        <Text style={s.h2}>{t("ui.damageRecords", { n: d.evidence.records.length })}</Text>
        {d.evidence.records.length === 0 && <Text style={s.muted}>{t("ui.damageNoRecords")}</Text>}
        {d.evidence.records.length > 0 && (
          <View style={s.th}>
            <Text style={{ width: 90 }}>{t("ui.damageColWhen")}</Text>
            <Text style={{ width: 90 }}>{t("ui.damageColKind")}</Text>
            <Text style={{ flex: 1 }}>{t("ui.damageColDetail")}</Text>
          </View>
        )}
        {d.evidence.records.map((r) => (
          <View key={r.id} style={s.row} wrap={false}>
            <Text style={{ width: 90 }}>{fmtDateTime(r.capturedAt)}</Text>
            <Text style={{ width: 90 }}>{tk(`recordKinds.${r.kind}`)}</Text>
            <Text style={{ flex: 1 }}>{describeData(r.kind, r.data)}</Text>
          </View>
        ))}

        {d.photoUrls.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>{t("ui.photos")}</Text>
            <View style={s.photos}>
              {d.photoUrls.slice(0, 9).map((u) => (
                <Image key={u} src={u} style={s.photo} />
              ))}
            </View>
          </View>
        )}
        <Text style={[s.muted, { marginTop: 10 }]}>{t("ui.damageDisclaimer")}</Text>
        <Footer />
      </Page>
    </Document>
  );
}
