/**
 * Ficha del lote (F-23): lo que conviene saber antes de anotar, todo desde el celular y sin señal: vigor, lluvia del
 * mes, tareas abiertas y las últimas anotaciones. Para roles de oficina suma (ola 2): vigor contra la estancia y su
 * curva, historial de campañas, carencia, fenología, balance hídrico, pronóstico, edición de atributos y borrado.
 */
import { useState } from "react";
import type { MultiPolygon, Polygon } from "geojson";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { CloudRain, Copy, ListChecks, Pencil, Satellite, Trash2 } from "lucide-react-native";
import { describeRecord, t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { copyText } from "../../src/lib/copy";
import { isOwnerMode } from "../../src/lib/ownerSummary";
import { vigorTrend } from "../../src/lib/plotSheet";
import { plotTarget } from "../../src/lib/plotLabels";
import { decimalCoords, degMinCoords, fmtArea, fmtRain, latestVigorByPlot, localPlans, localSeasons, mapsLink, rotationFromLocal, vigorHistory } from "../../src/lib/plotInfo";
import { useReadOnly } from "../../src/lib/readOnly";
import { useSession } from "../../src/lib/session";
import { localChanged, syncNow } from "../../src/lib/sync";
import { showToast } from "../../src/lib/toast";
import { useUnits } from "../../src/lib/units";
import { useLocal } from "../../src/lib/useLocal";
import { TextField } from "../../src/office/ui";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { RECORD_ICON } from "../../src/ui/icons";
import { Button, Row, ScreenBody, SectionHeader, Sheet, s as k, Text } from "../../src/ui/kit";
import { EditPlotSheet, editFromPlot, ForecastSection, PhenologySection, RotationSection, VigorSection, visitText, WaterBalanceSection, WithdrawalSection, type PlotEdit } from "../../src/ui/PlotSections";
import { C, T } from "../../src/ui/theme";

const RECENT = 10;
const day = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short" });
const num = (v: number, digits: number) =>
  v.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function PlotSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const readOnly = useReadOnly();
  const units = useUnits();
  const office = isOwnerMode(session?.organization.role);
  const canEdit = office && !readOnly;
  const data = useLocal(() => {
    const db = getDb();
    const plot = db.plots().find((p) => p.id === id) ?? null;
    if (!plot) return null;
    const passes = db
      .lastTwoVigorPasses()
      .filter((p) => p.plotId === plot.id)
      .sort((a, b) => b.acquiredAt - a.acquiredAt);
    const latest = latestVigorByPlot(db);
    const mates = new Set(db.plots(plot.farmId).map((p) => p.id));
    return {
      plot,
      records: db.recordsOfPlot(plot.id, RECENT),
      tasks: db.openTasksListOfPlot(plot.id),
      rainMonth: db.rainThisMonth(plot.farmId),
      vigor: passes[0] ?? null,
      previous: passes[1] ?? null,
      lastVisit: db.lastVisitByPlot().get(plot.id) ?? null,
      history: office ? vigorHistory(db, plot.id) : [],
      farmMeans: [...latest].filter(([pid]) => mates.has(pid)).map(([, v]) => v.mean),
      rotation: office && plot.kind === "crop" ? rotationFromLocal(localSeasons(db), localPlans(db), plot.id) : [],
    };
  }, [id, office]);

  const [editing, setEditing] = useState<PlotEdit | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const patch = useOnlineMutation<Record<string, unknown>, { ok: boolean }>("PATCH", `/org/plots/${id}`);
  const remove = useOnlineMutation<void, { ok: boolean }>("DELETE", `/org/plots/${id}`);

  if (!data)
    return (
      <View style={k.screen}>
        <Stack.Screen options={{ title: "" }} />
        <ScreenBody>
          <Text style={T.heading}>{t("app.plotGone")}</Text>
        </ScreenBody>
      </View>
    );
  const { plot, records, tasks, rainMonth, vigor, previous, lastVisit, history, farmMeans, rotation } = data;
  const trend = vigorTrend(vigor, previous);
  const crop = plot.kind === "crop";
  const [cLon, cLat] = (() => {
    const c = plotTarget(plot.geometry);
    return [c.lon, c.lat] as const;
  })();

  const copyCoords = async () => {
    const text = `${plot.name}\n${decimalCoords(cLon, cLat)}\n${degMinCoords(cLon, cLat)}\n${mapsLink(cLon, cLat)}`;
    if (await copyText(text)) showToast(t("ui.copied"));
  };

  const openEdit = () => {
    patch.reset();
    setFormError(null);
    setEditing(editFromPlot(plot));
  };

  const submitEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setFormError(t("office.plotNeedsName"));
    setFormError(null);
    const geo = JSON.parse(plot.geometry) as Polygon | MultiPolygon;
    const same = editing.season === (plot.season ?? "") && editing.sowingDate === (plot.sowingDate ?? "") && editing.pastureType === (plot.pastureType ?? "");
    const orgId = session?.organization.id;
    // Nombre, tipo y cultivo viajan por el outbox (anda sin señal). Campaña, siembra y pastura no están en el protocolo de sync: van por REST.
    if (same && orgId && geo.type === "Polygon" && geo.coordinates.length === 1) {
      getDb().savePlot(orgId, { id: plot.id, farmId: plot.farmId, name, kind: editing.kind, crop: editing.kind === "crop" ? ((editing.crop || null) as typeof plot.crop) : null, geometry: geo });
      localChanged();
      setEditing(null);
      showToast(t("ui.toastPlotUpdated"));
      void syncNow();
      return;
    }
    const isCrop = editing.kind === "crop";
    const r = await patch.mutate({ name, kind: editing.kind, crop: isCrop ? editing.crop || null : null, season: isCrop ? editing.season || null : null, sowingDate: editing.sowingDate || null, pastureType: isCrop ? null : editing.pastureType.trim() || null });
    if (r.ok) {
      setEditing(null);
      showToast(t("ui.toastPlotUpdated"));
      void syncNow();
    }
  };

  const doDelete = async () => {
    const r = await remove.mutate();
    if (r.ok) {
      setConfirming(false);
      showToast(t("ui.toastPlotDeleted"));
      void syncNow();
      router.back();
    }
  };

  const vigorSection = office && history.length > 0;

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
                onPress={() => router.push({ pathname: "/goto", params: { lon: String(cLon), lat: String(cLat), name: plot.name } })}
              />
              {canEdit && (
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
          {[crop ? (plot.crop ? t(`ui.cropName_${plot.crop}` as MessageKey) : t("ui.crop")) : t("ui.pasture"), fmtArea(plot.areaHa, units), plot.season ? t(`office.plotSeason_${plot.season}` as MessageKey) : null, visitText(lastVisit)].filter(Boolean).join(" · ")}
        </Text>

        <SectionHeader title={t("app.plotSheetNow")} />
        {!vigorSection && (
          <Row
            icon={Satellite}
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
                : office
                  ? t("app.plotSheetVigorNone")
                  : t("app.plotSheetVigorOwnersOnly")
            }
          />
        )}
        <Row
          icon={CloudRain}
          title={t("app.plotSheetRain")}
          subtitle={rainMonth > 0 ? t("office.plotRainMonth", { value: fmtRain(rainMonth, units) }) : t("app.plotSheetRainNone")}
        />

        {vigorSection && <VigorSection history={history} farmMeans={farmMeans} plotName={plot.name} />}

        {office && crop && <WithdrawalSection plot={plot} />}
        {office && crop && <PhenologySection plotId={plot.id} />}
        {office && crop && (
          <WaterBalanceSection plotId={plot.id} units={units} onIrrigate={readOnly ? null : () => router.push({ pathname: "/annotate", params: { plotId: plot.id, kind: "irrigation" } })} />
        )}
        {office && crop && <ForecastSection plot={plot} units={units} />}
        {office && crop && <RotationSection plotId={plot.id} local={rotation} />}

        {tasks.length > 0 && <SectionHeader title={t("app.plotSheetTasks")} />}
        {tasks.map((task) => (
          <Row
            key={task.id}
            icon={ListChecks}
            title={task.title}
            subtitle={task.dueDate ? day(Date.parse(`${task.dueDate}T12:00:00-03:00`)) : undefined}
            onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
          />
        ))}

        {records.length > 0 && <SectionHeader title={t("app.plotSheetRecent")} />}
        {records.map((r) => (
          <Row
            key={r.id}
            icon={RECORD_ICON[r.kind]}
            title={describeRecord(r.kind, JSON.parse(r.data))}
            subtitle={`${t(`recordKinds.${r.kind}`)} · ${day(r.capturedAt)}`}
            onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
          />
        ))}

        <SectionHeader title={t("office.plotMore")} />
        <Row icon={Copy} title={t("ui.copyCoords")} subtitle={degMinCoords(cLon, cLat)} onPress={() => void copyCoords()} />
        {canEdit && <Row icon={Pencil} title={t("office.plotEdit")} subtitle={t("office.plotEditHint")} onPress={openEdit} />}
        {canEdit && (
          <Row
            icon={Trash2}
            tone="danger"
            title={t("office.plotDelete")}
            onPress={() => {
              remove.reset();
              setTyped("");
              setConfirming(true);
            }}
          />
        )}
      </ScreenBody>

      {editing && (
        <EditPlotSheet visible draft={editing} onChange={(p) => setEditing((d) => (d ? { ...d, ...p } : d))} onClose={() => setEditing(null)} onSubmit={() => void submitEdit()} pending={patch.pending} error={formError ?? patch.error} />
      )}
      <Sheet visible={confirming} title={t("office.plotDeleteTitle")} onClose={() => setConfirming(false)} avoidKeyboard>
        <Text style={T.body}>{t("office.plotDeleteBody", { name: plot.name })}</Text>
        <View style={{ marginTop: 8 }}>
          <TextField label={t("office.plotDeleteType", { name: plot.name })} value={typed} onChangeText={setTyped} autoCapitalize="none" />
        </View>
        {remove.error ? (
          <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
            {remove.error}
          </Text>
        ) : null}
        <Button kind="danger" title={t("office.plotDelete")} disabled={typed.trim().toLowerCase() !== plot.name.trim().toLowerCase()} loading={remove.pending} onPress={() => void doDelete()} style={{ marginTop: 16 }} />
        <Button kind="text" title={t("ui.cancel")} onPress={() => setConfirming(false)} style={{ marginTop: 4 }} />
      </Sheet>
    </View>
  );
}
