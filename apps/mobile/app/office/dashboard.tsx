/** Tablero del dueño (función 19): GET /org/dashboard. Cifras, avisos y superficie por cultivo. */
import { View } from "react-native";
import { isFieldRole, t, type MessageKey, areaLabel, haToArea, mmToRain, rainLabel } from "@yvy/shared";
import { getSession } from "../../src/lib/session";
import { useUnits } from "../../src/lib/units";
import { fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { BarList, StatRow } from "../../src/office/ui";
import { SectionHeader, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

interface Dashboard {
  /** Solo viene con el permiso de montos (dueño y administrador). */
  margin: { incomePyg: number; costPyg: number; marginPyg: number; entries: number } | null;
  areaByCrop: { crop: string | null; kind: "crop" | "pasture"; ha: number; plots: number }[];
  rain: { month: string; farmsWithData: number; mm: number | null; normalMm: number | null; pctOfNormal: number | null };
  alerts: { total: number; byKind: { kind: string; severity: string; n: number }[] };
  activity: { workers: number; activeWorkers7d: number; staff: number; activeStaff7d: number };
  records7d: { total: number; byWorkers: number; byKind: { kind: string; n: number }[] };
}

const gs = (n: number) => `${fmtNumber(n, 0)} Gs`;

export default function DashboardScreen() {
  const allowed = !isFieldRole(getSession()?.organization.role ?? "");
  const units = useUnits();
  const q = useOnline<Dashboard>(allowed ? "/org/dashboard" : null);
  return (
    <OfficeScreen title={t("ui.dash.title")} query={q}>
      <OnlineState query={q} empty={{ title: t("office.common.loadFailed") }}>
        {(d) => {
          const label = (c: Dashboard["areaByCrop"][number]) => (c.kind === "pasture" ? t("ui.common.pasture") : c.crop ? t(`ui.crop.name_${c.crop}` as MessageKey) : t("ui.dash.noCrop"));
          const stats = [
            ...(d.rain.mm === null ? [] : [{ label: t("ui.dash.rainMonth"), value: fmtNumber(mmToRain(d.rain.mm, units.rain)), unit: rainLabel(units.rain) }]),
            ...(d.alerts.total > 0 ? [{ label: t("ui.common.activeAlerts"), value: d.alerts.total, tone: "danger" as const }] : []),
            ...(d.records7d.total > 0 ? [{ label: t("ui.dash.records"), value: d.records7d.total }] : []),
            ...(d.activity.workers > 0 ? [{ label: t("ui.dash.activity"), value: `${d.activity.activeWorkers7d}/${d.activity.workers}` }] : []),
            ...(d.margin && d.margin.entries > 0
              ? [{ label: t("ui.dash.margin"), value: gs(d.margin.marginPyg), tone: d.margin.marginPyg < 0 ? ("danger" as const) : undefined }]
              : []),
          ];
          const notes = [
            d.rain.normalMm === null
              ? t("ui.dash.rainNoData")
              : t("ui.dash.rainNormal", { normal: fmtNumber(mmToRain(d.rain.normalMm, units.rain)), pct: d.rain.pctOfNormal ?? 0 }).replace(" mm ", ` ${rainLabel(units.rain)} `),
            d.alerts.total > 0 ? d.alerts.byKind.map((a) => `${a.n} ${t(`ui.alert.kind_${a.kind}` as MessageKey).toLowerCase()}`).join(", ") : null,
            d.margin && d.margin.entries > 0 ? t("ui.dash.marginNote", { income: gs(d.margin.incomePyg), cost: gs(d.margin.costPyg) }) : null,
            d.activity.staff > 0 ? t("ui.dash.activityNote", { staff: d.activity.activeStaff7d, total: d.activity.staff }) : null,
            d.records7d.byWorkers > 0 ? t("office.dashboard.recordsNote", { n: d.records7d.byWorkers }) : null,
          ].filter(Boolean) as string[];
          return (
            <View>
              {stats.length > 0 && <StatRow items={stats} />}
              <View style={{ marginTop: 12, gap: 2 }}>
                {notes.map((n) => (
                  <Text key={n} style={T.small}>
                    {n}
                  </Text>
                ))}
              </View>
              {d.areaByCrop.length > 0 && (
                <>
                  <SectionHeader title={t("ui.dash.areaByCrop")} />
                  <BarList
                    rows={d.areaByCrop.map((c) => ({
                      label:
                        label(c) +
                        " · " +
                        t(c.plots === 1 ? "ui.plots.countOne" : "ui.plots.countMany", { n: c.plots }),
                      value: Math.round(haToArea(c.ha, units.area) * 10) / 10,
                    }))}
                    unit={areaLabel(units.area)}
                  />
                </>
              )}
            </View>
          );
        }}
      </OnlineState>
    </OfficeScreen>
  );
}
