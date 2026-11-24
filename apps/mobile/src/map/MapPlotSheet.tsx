import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { describeRecord, t, uaPerHa } from "@yvy/shared";
import type { Plot } from "../db/store";
import { getDb } from "../lib/db";
import { plotTarget } from "../lib/plotLabels";
import { Button, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { daysAgo } from "./mapStyle";
import { st } from "./styles";

type SheetRecord = { id: string; plotId: string | null; capturedAt: number; kind: Parameters<typeof describeRecord>[0]; data: string };

/** Ficha del lote elegido, abajo del mapa: datos del celular (anda sin señal) y accesos para anotar, abrir e ir. */
export function MapPlotSheet({
  plot,
  records,
  lastVisit,
  readOnly,
  canMarkPoi,
  gridHa,
  setGridHa,
  samplesCount,
  onClose,
}: {
  plot: Plot;
  records: SheetRecord[];
  lastVisit: Map<string, number>;
  readOnly: boolean;
  canMarkPoi: boolean;
  gridHa: 5 | 10 | null;
  setGridHa: (v: 5 | 10 | null) => void;
  samplesCount: number;
  onClose: () => void;
}) {
  const plotRecords = records.filter((r) => r.plotId === plot.id).slice(0, 3);
  return (
    <View style={st.sheet}>
      <SheetHeading plot={plot} lastVisit={lastVisit} onClose={onClose} />
      <PlotStats plot={plot} />
      {plotRecords.map((r) => (
        <Text key={r.id} style={[T.small, { marginTop: 8 }]} numberOfLines={1}>
          {new Date(r.capturedAt).toLocaleDateString("es-PY", { day: "numeric", month: "short" })} · {describeRecord(r.kind, JSON.parse(r.data))}
        </Text>
      ))}
      {!readOnly && <Button big title={t("app.annotateIn", { plot: plot.name })} onPress={() => router.push({ pathname: "/annotate", params: { plotId: plot.id } })} style={{ marginTop: 16 }} />}
      <Button kind={readOnly ? "primary" : "secondary"} title={t("app.plotSheetOpen")} onPress={() => router.push({ pathname: "/plot/[id]", params: { id: plot.id } })} style={{ marginTop: readOnly ? 16 : 8 }} />
      <View style={st.sheetLinks}>
        <Button
          kind="text"
          title={gridHa === null ? t("app.samplingShow5") : gridHa === 5 ? t("app.samplingShow10") : t("app.samplingHide")}
          onPress={() => setGridHa(gridHa === null ? 5 : gridHa === 5 ? 10 : null)}
          style={st.sheetLink}
        />
        {canMarkPoi && <Button kind="text" title={t("app.plotDrawEdit")} onPress={() => router.push({ pathname: "/plot-draw", params: { plotId: plot.id } })} style={st.sheetLink} />}
        <Button
          kind="text"
          title={t("app.gotoButton")}
          onPress={() => {
            const c = plotTarget(plot.geometry);
            router.push({ pathname: "/goto", params: { lon: String(c.lon), lat: String(c.lat), name: plot.name } });
          }}
          style={st.sheetLink}
        />
      </View>
      {gridHa !== null && <Text style={T.small}>{t("app.samplingInfo", { n: samplesCount })}</Text>}
    </View>  );
}


/** Nombre, tipo, superficie y última visita, con el botón de cerrar. */
function SheetHeading({ plot, lastVisit, onClose }: { plot: Plot; lastVisit: Map<string, number>; onClose: () => void }) {
  return (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={T.title}>{plot.name}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>
            {plot.kind === "pasture" ? t("ui.pasture") : (plot.crop ?? t("ui.crop"))} · {t("ui.ha", { value: plot.areaHa.toLocaleString("es-PY", { maximumFractionDigits: 0 }) })}
            {lastVisit.get(plot.id)
              ? ` · ${[t("app.lastVisitToday"), t("app.lastVisitYesterday")][daysAgo(lastVisit.get(plot.id)!)]?.toLowerCase() ?? t("app.lastVisit", { days: daysAgo(lastVisit.get(plot.id)!) }).toLowerCase()}`
              : ` · ${t("app.noVisits").toLowerCase()}`}
          </Text>
        </View>
        <Pressable onPress={() => onClose()} hitSlop={13} accessibilityRole="button" accessibilityLabel={t("ui.close")}>
          <X size={22} color={C.tinta2} />
        </Pressable>
      </View>
  );
}

/** Hacienda, lluvia del mes, vigor y tareas del lote: todo calculado en el celular (anda sin señal). */
function PlotStats({ plot }: { plot: Plot }) {
  const rainMonth = getDb().rainThisMonth(plot.farmId);
  const vigor = getDb().lastVigor(plot.id);
  const openTasks = getDb().openTasksOfPlot(plot.id);
  // G-03: hacienda del potrero, calculada en el celular (anda sin señal).
  const herd = plot.kind === "pasture" ? getDb().herdStock(plot.id) : null;
  const herdUa = herd ? uaPerHa(herd.counts, plot.areaHa) : null;
  return (
    <>
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
    </>
  );
}
