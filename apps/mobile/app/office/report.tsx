/**
 * Parte semanal (función 83): lo mismo que la web muestra en pantalla (registros, lluvia, avisos, tareas) y, en lugar del PDF,
 * "Compartir por WhatsApp" con un resumen corto. API: /org/records, /org/farms/:id/climate, /org/tasks, /org/alerts.
 */
import { useMemo, useState } from "react";
import { Linking, Share, View } from "react-native";
import { router } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { addDays, CHART, describeRecord, localDate, t, weeklyShareText, whatsappUrl, type MessageKey, mmToRain, rainLabel, mondayOf, rainByDate, type ClimateData } from "@yvy/shared";
import { API_URL } from "../../src/lib/session";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtDate, fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { useUnits } from "../../src/lib/units";
import { BarList, DataList, DateField, LineChart, Segmented, StatRow, type StatItem } from "../../src/office/ui";
import { EmptyState, Row, SectionHeader } from "../../src/ui/kit";

interface Rec {
  id: string;
  kind: string;
  authorId: string;
  authorName: string | null;
  plotName: string | null;
  capturedAt: number;
  data: Record<string, unknown>;
}
interface TaskRow {
  status: string;
  completedAt: number | null;
  dueDate: string;
}
interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  validFrom: number;
  validTo: number | null;
}

const HIGHLIGHT_KINDS = ["pest", "mortality", "theft"];
const DAY = 86_400_000;
const key = (k: string) => k as MessageKey;
const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const ddmmyyyy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default function Report() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const today = localDate(Date.now());
  const thisMonday = mondayOf(today);
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(today);
  const range = from && to && from <= to ? { from, to } : null;
  const fromMs = range ? Date.parse(`${range.from}T00:00:00-03:00`) : 0;
  const toMs = range ? Date.parse(`${range.to}T23:59:59-03:00`) : 0;
  const id = farm?.id;
  const records = useOnline<{ rows: Rec[] }>(
    id && range ? `/org/records?farmId=${id}&from=${fromMs}&to=${toMs}&limit=500` : null,
  );
  const days = Math.min(
    400,
    Math.max(30, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from || today}T00:00:00Z`)) / DAY) + 2),
  );
  const climate = useOnline<ClimateData>(id ? `/org/farms/${id}/climate?days=${days}` : null);
  const tasks = useOnline<TaskRow[]>(id ? `/org/tasks?farmId=${id}` : null);
  const alerts = useOnline<AlertRow[]>(id ? `/org/alerts?farmId=${id}` : null);

  const rows = records.data?.rows ?? [];
  const model = useMemo(() => {
    const byKind = new Map<string, number>();
    const byAuthor = new Map<string, number>();
    for (const r of rows) {
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
      const a = r.authorName ?? "—";
      byAuthor.set(a, (byAuthor.get(a) ?? 0) + 1);
    }
    const sorted = (m: Map<string, number>, label: (k: string) => string) =>
      [...m].map(([k, value]) => ({ label: label(k), value })).sort((a, b) => b.value - a.value);
    const sat = rainByDate(
      (climate.data?.daily ?? []).filter((d) => range && d.date >= range.from && d.date <= range.to),
    );
    const gaugeByDay = new Map<string, number>();
    for (const g of (climate.data?.gauge ?? []).filter((g) => g.capturedAt >= fromMs && g.capturedAt <= toMs)) {
      const d = localDate(g.capturedAt);
      gaugeByDay.set(d, (gaugeByDay.get(d) ?? 0) + g.mm);
    }
    const rainDays: string[] = [];
    if (range) for (let d = range.from; d <= range.to && rainDays.length < 62; d = addDays(d, 1)) rainDays.push(d);
    return {
      byKind: sorted(byKind, (k) => t(key(`record-kinds.kind.${k}`))),
      byAuthor: sorted(byAuthor, (k) => k),
      satTotal: sat.size ? [...sat.values()].reduce((a, b) => a + b, 0) : null,
      gaugeTotal: gaugeByDay.size ? [...gaugeByDay.values()].reduce((a, b) => a + b, 0) : null,
      rainDays,
      sat,
      gaugeByDay,
    };
  }, [rows, climate.data, from, to]);

  const periodAlerts = (alerts.data ?? []).filter((a) => a.validFrom <= toMs && (a.validTo ?? a.validFrom) >= fromMs);
  const done = (tasks.data ?? []).filter(
    (x) => x.status === "done" && x.completedAt !== null && x.completedAt >= fromMs && x.completedAt <= toMs,
  ).length;
  const late = (tasks.data ?? []).filter((x) => x.status === "open" && x.dueDate <= to && x.dueDate < today).length;
  const workers = new Set(rows.map((r) => r.authorId)).size;
  const rain = model.satTotal ?? model.gaugeTotal;
  const highlights = rows.filter((r) => HIGHLIGHT_KINDS.includes(r.kind));
  const hasRainDays = model.rainDays.some((d) => (model.sat.get(d) ?? 0) > 0 || (model.gaugeByDay.get(d) ?? 0) > 0);

  const share = () => {
    if (!farm || !range) return;
    const text = weeklyShareText({
      farmName: farm.name,
      from: ddmmyyyy(range.from),
      to: ddmmyyyy(range.to),
      records: rows.length,
      workers,
      rainMm: rain,
      alerts: periodAlerts.map((a) => a.summary),
      link: `${API_URL}/estancias/${farm.id}/parte?desde=${range.from}&hasta=${range.to}`,
    });
    Linking.openURL(whatsappUrl(text)).catch(() => Share.share({ message: text }).catch(() => undefined));
  };

  const stats: StatItem[] = [];
  if (rows.length > 0) stats.push({ label: t("ui.nav.records"), value: rows.length });
  if (rain !== null && rain > 0) stats.push({ label: t("ui.rain.week"), value: fmtNumber(mmToRain(rain, units.rain)), unit: rainLabel(units.rain) });
  if (periodAlerts.length > 0) stats.push({ label: t("ui.alerts.title"), value: periodAlerts.length });
  if (done > 0) stats.push({ label: t("ui.report.tasksDone"), value: done });
  if (late > 0) stats.push({ label: t("ui.report.tasksOverdue"), value: late, tone: "danger" });

  const preset =
    from === thisMonday && to === today
      ? "this"
      : from === addDays(thisMonday, -7) && to === addDays(thisMonday, -1)
        ? "last"
        : "custom";

  return (
    <OfficeScreen
      title={t("ui.report.title")}
      subtitle={farm?.name}
      query={records}
      action={{ label: t("ui.share.whatsapp"), icon: MessageCircle, onPress: share, disabled: !range || !records.data }}
    >
      <FarmChips farms={farms} value={id} onChange={setFarmId} />
      <View style={{ marginTop: 16 }}>
        <Segmented<"this" | "last" | "custom">
          options={[
            { value: "this", label: t("ui.report.thisWeek") },
            { value: "last", label: t("ui.report.lastWeek") },
          ]}
          value={preset}
          onChange={(v) => {
            setFrom(v === "this" ? thisMonday : addDays(thisMonday, -7));
            setTo(v === "this" ? today : addDays(thisMonday, -1));
          }}
        />
      </View>
      <DateField label={t("ui.common.from")} value={from} onChange={setFrom} />
      <DateField label={t("ui.common.to")} value={to} onChange={setTo} />
      {!farm ? (
        <EmptyState title={t("office.reports.noFarms")} />
      ) : !range ? (
        <EmptyState title={t("office.common.invalidDate")} />
      ) : (
        <OnlineState query={records} isEmpty={() => false} empty={{ title: t("ui.report.noRecords") }}>
          {() => (
            <>
              {stats.length > 0 ? (
                <StatRow items={stats} />
              ) : (
                <EmptyState title={t("ui.report.noRecords")} hint={t("ui.report.noRecordsHint")} />
              )}
              {model.byKind.length > 0 && (
                <>
                  <SectionHeader title={t("ui.report.byKind")} />
                  <BarList rows={model.byKind.slice(0, 8)} />
                </>
              )}
              {model.byAuthor.length > 1 && (
                <>
                  <SectionHeader title={t("ui.report.byAuthor")} />
                  <BarList rows={model.byAuthor.slice(0, 8)} />
                </>
              )}
              {hasRainDays && (
                <>
                  <SectionHeader title={t("ui.report.rainDaily")} />
                  <LineChart
                    yUnit={rainLabel(units.rain)}
                    series={[
                      {
                        label: t("ui.common.satelliteRain"),
                        color: CHART.comparison,
                        points: model.rainDays.map((d) => ({ x: ddmm(d), y: model.sat.has(d) ? mmToRain(model.sat.get(d)!, units.rain) : null })),
                      },
                      ...(model.gaugeByDay.size
                        ? [
                            {
                              label: t("ui.common.gauge"),
                              color: CHART.gauge,
                              points: model.rainDays.map((d) => ({ x: ddmm(d), y: model.gaugeByDay.has(d) ? mmToRain(model.gaugeByDay.get(d)!, units.rain) : null })),
                            },
                          ]
                        : []),
                    ]}
                  />
                </>
              )}
              {periodAlerts.length > 0 && (
                <>
                  <SectionHeader title={t("ui.alerts.title")} />
                  {periodAlerts.map((a) => (
                    <Row
                      key={a.id}
                      title={`${t(key(`ui.alert.kind_${a.kind}`))} · ${t(key(`ui.severity.${a.severity}`))}`}
                      subtitle={`${a.summary} (${fmtDate(a.validFrom)})`}
                    />
                  ))}
                </>
              )}
              {highlights.length > 0 && (
                <>
                  <SectionHeader title={t("ui.report.highlights")} />
                  <DataList
                    rows={highlights}
                    keyOf={(r) => r.id}
                    title={(r) => describeRecord(r.kind, r.data)}
                    subtitle={(r) =>
                      [t(key(`record-kinds.kind.${r.kind}`)), r.plotName, r.authorName, fmtDate(r.capturedAt)]
                        .filter(Boolean)
                        .join(" · ")
                    }
                    onPress={(r) => router.push(`/record/${r.id}`)}
                    empty={{ title: "" }}
                  />
                </>
              )}
            </>
          )}
        </OnlineState>
      )}
    </OfficeScreen>
  );
}
