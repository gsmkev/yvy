/**
 * Cambios y quemadas (función 93): área quemada tras un foco (GET /org/farms/:id/burned) y cambio de cobertura entre dos fechas
 * (GET /org/farms/:id/cover-change), en lectura. Sin mapa ni PDF; pedir un cálculo nuevo de cobertura sigue siendo de la web.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Link2 } from "lucide-react-native";
import { t } from "@yvy/shared";
import { burnedEvents, coverKeys, parseCoverKey, summarizeCover, type AnalysisPlot, type BurnedMetrics, type CoverMetrics } from "../../src/lib/changesData";
import { getSession } from "../../src/lib/session";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { DataList, FilterChips, KeyValue, Segmented, StatRow } from "../../src/office/ui";
import { EmptyState, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

const ha = (n: number) => `${fmtNumber(n, 2)} ha`;
const day = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const CLASSES = ["forest", "pasture", "crop", "other"] as const;

function Burned({ plots }: { plots: AnalysisPlot<BurnedMetrics>[] }) {
  const events = useMemo(() => burnedEvents(plots), [plots]);
  const [picked, setPicked] = useState<string | null>(null);
  const ev = events.find((e) => e.refKey === picked) ?? events[0];
  if (!ev) return <EmptyState title={t("ui.burnedNone")} />;
  return (
    <>
      {events.length > 1 && <FilterChips value={ev.refKey} onChange={setPicked} options={events.map((e) => ({ value: e.refKey, label: fmtDate(e.eventAt) }))} />}
      <StatRow
        items={[
          { label: t("ui.burnedTotal"), value: fmtNumber(ev.burnedHa, 2), unit: "ha", tone: ev.burnedHa > 0 ? "danger" : undefined },
          ...(ev.highHa > 0 ? [{ label: t("ui.burnedHigh"), value: fmtNumber(ev.highHa, 2), unit: "ha" }] : []),
          { label: t("ui.burnedPlots"), value: ev.plots.length },
        ]}
      />
      {ev.fromAt !== null && ev.toAt !== null && <Text style={[T.small, { marginTop: 12 }]}>{t("ui.burnedImages", { from: fmtDate(ev.fromAt), to: fmtDate(ev.toAt) })}</Text>}
      <DataList rows={ev.plots} keyOf={(p) => p.plotId} title={(p) => p.plotName} subtitle={(p) => `${t("ui.burnedColHigh")}: ${ha(p.metrics.highHa)}`} right={(p) => <Text style={[T.bodyMedium, { color: C.peligro }]}>{ha(p.metrics.burnedHa)}</Text>} empty={{ title: t("ui.burnedNone") }} />
      <Text style={[T.small, { marginTop: 12 }]}>
        {t("ui.burnedUnaffected", { n: ev.unaffected })}
        {ev.noData > 0 ? ` ${t("ui.burnedNoData", { n: ev.noData })}` : ""}
      </Text>
      <Text style={[T.small, { marginTop: 8 }]}>{t("ui.burnedMethod")}</Text>
      <Text style={T.small}>{t("attribution.copernicus")} · {t("attribution.firms")}</Text>
    </>
  );
}

function Cover({ plots }: { plots: AnalysisPlot<CoverMetrics>[] }) {
  const keys = useMemo(() => coverKeys(plots), [plots]);
  const [picked, setPicked] = useState<string | null>(null);
  const key = picked && keys.includes(picked) ? picked : keys[0];
  const rows = plots.filter((p) => p.refKey === key);
  const range = key ? parseCoverKey(key) : null;
  if (!key || !range || rows.length === 0) return <EmptyState title={t("ui.coverNone")} />;
  const sum = summarizeCover(rows);
  return (
    <>
      {keys.length > 1 && <FilterChips value={key} onChange={setPicked} options={keys.map((k) => ({ value: k, label: (() => { const r = parseCoverKey(k); return r ? `${day(r.from).slice(6)}–${day(r.to).slice(6)}` : k; })() }))} />}
      <Text style={[T.small, { marginTop: 12 }]}>{t("ui.coverRange", { from: day(range.from), to: day(range.to) })}</Text>
      <StatRow
        items={[
          { label: t("ui.coverForestFrom", { date: day(range.from) }), value: fmtNumber(sum.from.forest, 2), unit: "ha" },
          { label: t("ui.coverForestTo", { date: day(range.to) }), value: fmtNumber(sum.to.forest, 2), unit: "ha" },
          ...(sum.forestLostHa > 0 ? [{ label: t("ui.coverForestLost"), value: fmtNumber(sum.forestLostHa, 2), unit: "ha", tone: "danger" as const }] : []),
        ]}
      />
      <KeyValue rows={CLASSES.map((c) => ({ label: t(`ui.coverClass_${c}`), value: `${ha(sum.from[c])} → ${ha(sum.to[c])}` }))} />
      <Text style={[T.small, { marginTop: 12 }]}>{t("ui.coverConversions", { pasture: ha(sum.forestToPasture), crop: ha(sum.forestToCrop), other: ha(sum.forestToOther) })}</Text>
      <Text style={[T.small, { marginTop: 8 }]}>{t("ui.coverDisclaimer")}</Text>
      <Text style={T.small}>{t("attribution.copernicus")}</Text>
    </>
  );
}

export default function Changes() {
  const { farms, farm, setFarmId } = useFarmPick();
  const owner = getSession()?.organization.role === "owner";
  const [tab, setTab] = useState<"burned" | "cover">("burned");
  const id = farm?.id;
  const burned = useOnline<{ plots: AnalysisPlot<BurnedMetrics>[] }>(id ? `/org/farms/${id}/burned` : null);
  const cover = useOnline<{ plots: AnalysisPlot<CoverMetrics>[] }>(id ? `/org/farms/${id}/cover-change` : null);
  const q = tab === "burned" ? burned : cover;
  return (
    <OfficeScreen
      title={t("ui.changesTitle")}
      subtitle={farm?.name}
      query={q}
      action={owner && farm && q.data && q.data.plots.length > 0 ? { label: t("ui.shareLinkTitle"), icon: Link2, onPress: () => router.push(`/office/share-links?farmId=${farm.id}` as never) } : undefined}
    >
      <FarmChips farms={farms} value={id} onChange={setFarmId} />
      {!farm ? (
        <EmptyState title={t("office.reportsNoFarms")} />
      ) : (
        <>
          <Text style={[T.small, { marginTop: 12 }]}>{t("ui.changesDisclaimer")}</Text>
          <View style={{ marginTop: 16 }}>
            <Segmented<"burned" | "cover"> options={[{ value: "burned", label: t("ui.burnedTitle") }, { value: "cover", label: t("ui.coverTitle") }]} value={tab} onChange={setTab} />
          </View>
          {tab === "burned" ? (
            <OnlineState query={burned} isEmpty={(d) => d.plots.length === 0} empty={{ title: t("ui.burnedNone") }}>
              {(d) => <Burned plots={d.plots} />}
            </OnlineState>
          ) : (
            <OnlineState query={cover} isEmpty={(d) => d.plots.length === 0} empty={{ title: t("ui.coverNone") }}>
              {(d) => <Cover plots={d.plots} />}
            </OnlineState>
          )}
        </>
      )}
    </OfficeScreen>
  );
}
