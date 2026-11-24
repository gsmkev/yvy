/**
 * Zonas de amortiguación: lotes cerca de casas, escuelas, aguadas y cursos de agua, y aplicaciones de los últimos
 * 6 meses dentro de la distancia. Lotes, puntos y aplicaciones salen de la base local; los cursos de agua, de GET /org/farms/:id/lines.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { t, type MessageKey } from "@yvy/shared";
import { bufferAnalysis, BUFFER_KINDS, DEFAULT_DISTANCES, type BufferHit, type BufferKind } from "@yvy/geo";
import { getDb } from "../../../src/lib/db";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { useOnline } from "../../../src/office/useOnline";
import { DataList, KeyValue, StatRow } from "../../../src/office/ui";
import { EmptyState, SectionHeader, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

const DAY = 86_400_000;
const kindName = (k: BufferKind) => t((k === "stream" ? "ui.line.kind_stream" : `ui.poi.kinds_${k}`) as MessageKey);
const hitText = (h: BufferHit) => t("ui.buffer.hit", { kind: kindName(h.kind), name: h.name, m: fmtNumber(h.distanceM, 0) });

/** Franjas de resguardo para aplicaciones. */
export default function Buffer() {
  const { farms, farm, setFarmId } = useFarmPick();
  const lines = useOnline<{ kind: string; name: string; geometry: string }[]>(farm ? `/org/farms/${farm.id}/lines` : null);
  const local = useLocal(() => {
    if (!farm) return null;
    const db = getDb();
    const since = Date.now() - 180 * DAY;
    const plots = db.plots(farm.id);
    const names = new Map(plots.map((p) => [p.id, p.name]));
    return {
      plots: plots.filter((p) => p.kind === "crop"),
      pois: db.pois(farm.id),
      apps: db
        .records(500)
        .filter((r) => r.kind === "application" && r.farmId === farm.id && r.capturedAt >= since)
        .map((r) => ({ id: r.id, plotId: r.plotId, plotName: r.plotId ? (names.get(r.plotId) ?? null) : null, capturedAt: r.capturedAt, lon: r.lon, lat: r.lat, gpsAccuracyM: r.gpsAccuracyM })),
    };
  }, [farm?.id]);

  const streams = (lines.data ?? []).filter((l) => l.kind === "stream");
  const hasFeatures = !!local && (local.pois.some((p) => p.kind === "house" || p.kind === "school" || p.kind === "water") || streams.length > 0);
  const result = useMemo(() => {
    if (!local) return null;
    return bufferAnalysis(
      local.plots,
      { points: local.pois.map((p) => ({ kind: p.kind, name: p.name, lon: p.lon, lat: p.lat })), streams: streams.map((l) => ({ name: l.name, geometry: JSON.parse(l.geometry) })) },
      local.apps,
      DEFAULT_DISTANCES,
    );
  }, [local, lines.data]);
  const plotName = (id: string) => local?.plots.find((p) => p.id === id)?.name ?? "";

  return (
    <FarmFrame title={t("ui.buffer.title")} subtitle={t("ui.buffer.intro")} farms={farms} farm={farm} setFarmId={setFarmId}>
      {!hasFeatures || !result ? (
        <EmptyState title={t("office.buffer.nothing")} hint={t("office.buffer.nothingHint")} />
      ) : (
        <View>
          {lines.data === null && !lines.loading && <Text style={[T.small, { marginTop: 12 }]}>{t("office.buffer.linesFail")}</Text>}
          <StatRow items={[...(result.alerts.length > 0 ? [{ label: t("ui.buffer.alerts"), value: result.alerts.length, tone: "danger" as const }] : []), ...(result.plots.length > 0 ? [{ label: t("ui.buffer.plots"), value: result.plots.length }] : [])]} />
          {result.alerts.length === 0 ? (
            <Text style={[T.body, { marginTop: 12 }]}>{t("ui.buffer.noAlerts")}</Text>
          ) : (
            <>
              <SectionHeader title={t("ui.buffer.alerts")} />
              <DataList
                rows={result.alerts}
                keyOf={(a) => a.recordId}
                title={(a) => `${a.plotName ?? t("ui.buffer.noPlot")} · ${fmtDate(a.capturedAt)}`}
                subtitle={(a) => `${a.hits.map(hitText).join("; ")}. ${t(a.basis === "gps" ? "ui.buffer.basisGps" : "ui.buffer.basisPlot")}`}
                empty={{ title: t("ui.buffer.noAlerts") }}
              />
            </>
          )}
          {result.plots.length > 0 && (
            <>
              <SectionHeader title={t("ui.buffer.plots")} />
              <DataList rows={result.plots} keyOf={(p) => p.plotId} title={(p) => plotName(p.plotId)} subtitle={(p) => p.hits.map(hitText).join("; ")} empty={{ title: t("ui.buffer.noAlerts") }} />
            </>
          )}
          <SectionHeader title={t("office.buffer.distancesTitle")} />
          <KeyValue rows={BUFFER_KINDS.map((k) => ({ label: kindName(k), value: `${DEFAULT_DISTANCES[k]} m` }))} />
          <Text style={[T.small, { marginTop: 8, color: C.tinta2 }]}>{t("office.buffer.distancesNote")}</Text>
        </View>
      )}
    </FarmFrame>
  );
}
