/** Cuerpo de la ficha del lote. */
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { CloudRain, Copy, Pencil, Trash2 } from "lucide-react-native";
import { t, type MessageKey } from "@yvy/shared";
import { copyText } from "../lib/copy";
import { decimalCoords, degMinCoords, fmtArea, fmtRain, mapsLink } from "../lib/plotInfo";
import { vigorTrend } from "../lib/plotSheet";
import { plotTarget } from "../lib/plotLabels";
import { showToast } from "../lib/toast";
import { useUnits } from "../lib/units";
import { Button, Row, ScreenBody, SectionHeader, s as k, Text } from "../ui/kit";
import { EditPlotSheet, VigorSection, visitText } from "../ui/PlotSections";
import { T } from "../ui/theme";
import { DeleteSheet, OfficeSections, PlotLists, VigorRow } from "./PlotParts";
import { usePlotActions } from "./usePlotActions";
import type { usePlotData } from "./usePlotData";

type Data = NonNullable<ReturnType<typeof usePlotData>>;

/** Ficha de un lote ya cargado: cifras, secciones de oficina, tareas, anotaciones y acciones. */
export function PlotBody({ data, office, canEdit, readOnly }: { data: Data; office: boolean; canEdit: boolean; readOnly: boolean }) {
  const units = useUnits();
  const a = usePlotActions(data.plot);
  const { plot, records, tasks, rainMonth, vigor, previous, lastVisit, history, farmMeans, rotation } = data;
  const trend = vigorTrend(vigor, previous);
  const crop = plot.kind === "crop";
  const [cLon, cLat] = (() => {
    const c = plotTarget(plot.geometry);
    return [c.lon, c.lat] as const;
  })();

  const copyCoords = async () => {
    const text = `${plot.name}\n${decimalCoords(cLon, cLat)}\n${degMinCoords(cLon, cLat)}\n${mapsLink(cLon, cLat)}`;
    if (await copyText(text)) showToast(t("ui.common.copied"));
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
                title={t("app.annotate.in", { plot: plot.name })}
                onPress={() => router.push({ pathname: "/annotate", params: { plotId: plot.id } })}
              />
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 20 }}>
              <Button
                kind={readOnly ? "primary" : "text"}
                title={t("app.goto.button")}
                onPress={() => router.push({ pathname: "/goto", params: { lon: String(cLon), lat: String(cLat), name: plot.name } })}
              />
              {canEdit && (
                <Button
                  kind="text"
                  title={t("app.plot.drawEdit")}
                  onPress={() => router.push({ pathname: "/plot-draw", params: { plotId: plot.id } })}
                />
              )}
            </View>
          </>
        }
      >
        <Text style={T.title}>{plot.name}</Text>
        <Text style={[T.small, { marginTop: 4 }]}>
          {[crop ? (plot.crop ? t(`ui.crop.name_${plot.crop}` as MessageKey) : t("ui.common.crop")) : t("ui.common.pasture"), fmtArea(plot.areaHa, units), plot.season ? t(`office.plot.season_${plot.season}` as MessageKey) : null, visitText(lastVisit)].filter(Boolean).join(", ")}
        </Text>

        <SectionHeader title={t("app.plot.sheetNow")} />
        {!vigorSection && (
          <VigorRow vigor={vigor} trend={trend} office={office} />
        )}
        <Row
          icon={CloudRain}
          title={t("app.plot.sheetRain")}
          subtitle={rainMonth > 0 ? t("office.plot.rainMonth", { value: fmtRain(rainMonth, units) }) : t("app.plot.sheetRainNone")}
        />

        {vigorSection && <VigorSection history={history} farmMeans={farmMeans} plotName={plot.name} />}

        <OfficeSections plot={plot} office={office} readOnly={readOnly} units={units} rotation={rotation} />

        <PlotLists tasks={tasks} records={records} />
        <SectionHeader title={t("office.plot.more")} />
        <Row icon={Copy} title={t("ui.common.copyCoords")} subtitle={degMinCoords(cLon, cLat)} onPress={() => void copyCoords()} />
        {canEdit && <Row icon={Pencil} title={t("office.plot.edit")} subtitle={t("office.plot.editHint")} onPress={a.openEdit} />}
        {canEdit && (
          <Row
            icon={Trash2}
            tone="danger"
            title={t("office.plot.delete")}
            onPress={a.askDelete}
          />
        )}
      </ScreenBody>

      {a.editing && (
        <EditPlotSheet visible draft={a.editing} onChange={(p) => a.setEditing((d) => (d ? { ...d, ...p } : d))} onClose={() => a.setEditing(null)} onSubmit={() => void a.submitEdit()} pending={a.patch.pending} error={a.formError ?? a.patch.error} />
      )}
      <DeleteSheet plot={plot} a={a} />
    </View>
  );
}
