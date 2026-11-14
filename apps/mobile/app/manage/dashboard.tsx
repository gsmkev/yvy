/** Tablero del dueño y del administrador: las cifras de la semana de toda la organización (GET /org/dashboard). */
import { View } from "react-native";
import { Stack } from "expo-router";
import { t, type MessageKey, type OwnerDashboard } from "@yvy/shared";
import { fmtGs, fmtNum } from "../../src/lib/format";
import { DASHBOARD_TTL_MS, withoutMargin } from "../../src/lib/manageRoutes";
import { useOnline } from "../../src/lib/online";
import { Row, SectionHeader, Text } from "../../src/ui/kit";
import { OnlineScreen } from "../../src/ui/online";
import { Stat, StatGrid } from "../../src/ui/Stat";
import { T } from "../../src/ui/theme";

export default function Dashboard() {
  const q = useOnline<OwnerDashboard>("/org/dashboard", { ttlMs: DASHBOARD_TTL_MS, forCache: withoutMargin as never });
  return (
    <OnlineScreen q={q} ttlMs={DASHBOARD_TTL_MS} title={<Text style={T.display}>{t("ui.dashTitle")}</Text>}>
      {(d) => {
        const cropLabel = (c: OwnerDashboard["areaByCrop"][number]) =>
          c.kind === "pasture" ? t("ui.pasture") : c.crop ? t(`ui.cropName_${c.crop}` as MessageKey) : t("ui.dashNoCrop");
        return (
          <View>
            <Stack.Screen options={{ title: "" }} />
            <StatGrid>
              <Stat
                label={t("ui.dashRainMonth")}
                value={d.rain.mm === null ? "—" : fmtNum(d.rain.mm)}
                unit={d.rain.mm === null ? undefined : "mm"}
                note={d.rain.normalMm === null ? t("ui.dashRainNoData") : t("ui.dashRainNormal", { normal: fmtNum(d.rain.normalMm), pct: d.rain.pctOfNormal ?? 0 })}
              />
              <Stat
                label={t("ui.activeAlerts")}
                value={d.alerts.total}
                tone={d.alerts.total ? "danger" : undefined}
                note={d.alerts.total ? d.alerts.byKind.map((a) => `${a.n} ${t(`ui.alertKind_${a.kind}` as MessageKey).toLowerCase()}`).join(", ") : t("ui.dashNoAlerts")}
              />
              <Stat label={t("ui.dashActivity")} value={`${d.activity.activeWorkers7d}/${d.activity.workers}`} note={t("ui.dashActivityNote", { staff: d.activity.activeStaff7d, total: d.activity.staff })} />
              <Stat label={t("ui.dashRecords")} value={d.records7d.total} note={t("ui.dashRecordsNote", { n: d.records7d.byWorkers })} />
              {d.margin ? (
                <Stat
                  label={t("ui.dashMargin")}
                  value={d.margin.entries ? fmtGs(d.margin.marginPyg) : "—"}
                  tone={d.margin.entries && d.margin.marginPyg < 0 ? "danger" : undefined}
                  note={d.margin.entries ? t("ui.dashMarginNote", { income: fmtGs(d.margin.incomePyg), cost: fmtGs(d.margin.costPyg) }) : t("ui.dashMarginNone")}
                />
              ) : null}
            </StatGrid>
            {d.areaByCrop.length > 0 && (
              <>
                <SectionHeader title={t("ui.dashAreaByCrop")} />
                {d.areaByCrop.map((c, i) => (
                  <Row key={`${c.crop}-${c.kind}-${i}`} title={cropLabel(c)} subtitle={t(c.plots === 1 ? "ui.plotsCountOne" : "ui.plotsCountMany", { n: c.plots })} right={<Text style={T.bodyMedium}>{fmtNum(c.ha)} ha</Text>} />
                ))}
              </>
            )}
            {d.records7d.byKind.length > 0 && (
              <>
                <SectionHeader title={t("ui.dashRecords")} />
                {d.records7d.byKind.map((k) => (
                  <Row key={k.kind} title={t(`recordKinds.${k.kind}` as MessageKey)} right={<Text style={T.bodyMedium}>{k.n}</Text>} />
                ))}
              </>
            )}
          </View>
        );
      }}
    </OnlineScreen>
  );
}
