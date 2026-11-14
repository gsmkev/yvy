/**
 * Ficha del lote (F-23): lo que conviene saber antes de anotar, todo desde el celular y sin señal:
 * vigor, lluvia del mes, tareas abiertas y las últimas anotaciones.
 */
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { describeRecord, isFieldRole, t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { daysSince, vigorTrend } from "../../src/lib/plotSheet";
import { isOwnerMode } from "../../src/lib/ownerSummary";
import { useSession } from "../../src/lib/session";
import { useLocal } from "../../src/lib/useLocal";
import { plotTarget } from "../../src/lib/plotLabels";
import { Button, Row, ScreenBody, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";
import { useReadOnly } from "../../src/lib/readOnly";

const RECENT = 10;
const day = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" });
const num = (v: number, digits: number) =>
  v.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function PlotSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const readOnly = useReadOnly();
  const canEditShape = !isFieldRole(session?.organization.role ?? "worker") && !readOnly;
  const data = useLocal(() => {
    const db = getDb();
    const plot = db.plots().find((p) => p.id === id) ?? null;
    if (!plot) return null;
    const passes = db
      .lastTwoVigorPasses()
      .filter((p) => p.plotId === plot.id)
      .sort((a, b) => b.acquiredAt - a.acquiredAt);
    return {
      plot,
      records: db.recordsOfPlot(plot.id, RECENT),
      tasks: db.openTasksListOfPlot(plot.id),
      rainMonth: db.rainThisMonth(plot.farmId),
      vigor: passes[0] ?? null,
      previous: passes[1] ?? null,
      lastVisit: db.lastVisitByPlot().get(plot.id) ?? null,
    };
  }, [id]);

  if (!data)
    return (
      <View style={k.screen}>
        <Stack.Screen options={{ title: "" }} />
        <ScreenBody>
          <Text style={T.heading}>{t("app.plotGone")}</Text>
        </ScreenBody>
      </View>
    );
  const { plot, records, tasks, rainMonth, vigor, previous, lastVisit } = data;
  const trend = vigorTrend(vigor, previous);
  const visitDays = lastVisit === null ? null : daysSince(lastVisit);

  return (
    <View style={k.screen}>
      <Stack.Screen options={{ title: "" }} />
      <ScreenBody
        footer={
          <>
            {!readOnly && (
              <Button
                big
                title={t("app.annotateIn", { plot: plot.name })}
                onPress={() => router.push({ pathname: "/annotate", params: { plotId: plot.id } })}
              />
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 20 }}>
              <Button
                kind={readOnly ? "primary" : "text"}
                title={t("app.gotoButton")}
                onPress={() => {
                  const c = plotTarget(plot.geometry);
                  router.push({
                    pathname: "/goto",
                    params: { lon: String(c.lon), lat: String(c.lat), name: plot.name },
                  });
                }}
              />
              {canEditShape && (
                <Button
                  kind="text"
                  title={t("app.plotDrawEdit")}
                  onPress={() => router.push({ pathname: "/plot-draw", params: { plotId: plot.id } })}
                />
              )}
            </View>
          </>
        }
      >
        <Text style={T.title}>{plot.name}</Text>
        <Text style={[T.small, { marginTop: 4 }]}>
          {[
            plot.kind === "pasture" ? t("ui.pasture") : (plot.crop ?? t("ui.crop")),
            t("ui.ha", { value: plot.areaHa.toLocaleString("es-PY", { maximumFractionDigits: 0 }) }),
            visitDays === null
              ? t("app.noVisits")
              : visitDays === 0
                ? t("app.lastVisitToday")
                : visitDays === 1
                  ? t("app.lastVisitYesterday")
                  : t("app.lastVisit", { days: visitDays }),
          ].join(" · ")}
        </Text>

        <SectionHeader title={t("app.plotSheetNow")} />
        <Row
          title={t("app.plotSheetVigor")}
          subtitle={
            vigor
              ? [
                  t("app.plotVigor", { value: num(vigor.mean, 2), date: day(vigor.acquiredAt) }),
                  trend.kind === "down"
                    ? t("app.plotSheetVigorDown", { pct: Math.round(trend.pct) })
                    : trend.kind === "up"
                      ? t("app.plotSheetVigorUp", { pct: Math.round(trend.pct) })
                      : trend.kind === "flat"
                        ? t("app.plotSheetVigorFlat")
                        : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : isOwnerMode(session?.organization.role)
                ? t("app.plotSheetVigorNone")
                : t("app.plotSheetVigorOwnersOnly")
          }
        />
        <Row
          title={t("app.plotSheetRain")}
          subtitle={rainMonth > 0 ? t("app.plotRainMonth", { mm: Math.round(rainMonth) }) : t("app.plotSheetRainNone")}
        />

        {tasks.length > 0 && <SectionHeader title={t("app.plotSheetTasks")} />}
        {tasks.map((task) => (
          <Row
            key={task.id}
            title={task.title}
            subtitle={task.dueDate ? day(Date.parse(`${task.dueDate}T12:00:00-03:00`)) : undefined}
            onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
          />
        ))}

        {records.length > 0 && <SectionHeader title={t("app.plotSheetRecent")} />}
        {records.map((r) => (
          <Row
            key={r.id}
            title={describeRecord(r.kind, JSON.parse(r.data))}
            subtitle={`${t(`recordKinds.${r.kind}`)} · ${day(r.capturedAt)}`}
            onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
          />
        ))}
      </ScreenBody>
    </View>
  );
}
