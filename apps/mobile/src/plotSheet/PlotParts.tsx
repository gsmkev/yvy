/** Partes de la ficha del lote: vigor, secciones de oficina, listas y confirmación de borrado. */
import { View } from "react-native";
import { router } from "expo-router";
import { ListChecks, Satellite } from "lucide-react-native";
import { describeRecord, t } from "@yvy/shared";
import type { Plot } from "../db/store";
import { vigorTrend } from "../lib/plotSheet";
import { TextField } from "../office/ui";
import { RECORD_ICON } from "../ui/icons";
import { Button, Row, SectionHeader, Sheet, Text } from "../ui/kit";
import { ForecastSection, PhenologySection, RotationSection, WaterBalanceSection, WithdrawalSection } from "../ui/PlotSections";
import { C, T } from "../ui/theme";
import { day, num } from "./format";
import type { usePlotActions } from "./usePlotActions";
import type { usePlotData } from "./usePlotData";

type Data = NonNullable<ReturnType<typeof usePlotData>>;

/** Vigor en la ficha cuando no hay curva de oficina: último valor y tendencia. */
export function VigorRow({ vigor, trend, office }: { vigor: Data["vigor"]; trend: ReturnType<typeof vigorTrend>; office: boolean }) {
  return (
    <Row
      icon={Satellite}
      title={t("app.plot.sheetVigor")}
      subtitle={
        vigor
          ? [
              t("app.plot.vigor", { value: num(vigor.mean, 2), date: day(vigor.acquiredAt) }),
              trend.kind === "down"
                ? t("app.plot.sheetVigorDown", { pct: Math.round(trend.pct) })
                : trend.kind === "up"
                  ? t("app.plot.sheetVigorUp", { pct: Math.round(trend.pct) })
                  : trend.kind === "flat"
                    ? t("app.plot.sheetVigorFlat")
                    : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : office
            ? t("app.plot.sheetVigorNone")
            : t("app.plot.sheetVigorOwnersOnly")
      }
    />
  );
}

/** Secciones de oficina de un lote de cultivo: carencia, fenología, balance hídrico, pronóstico y rotación. */
export function OfficeSections({ plot, office, readOnly, units, rotation }: { plot: Plot; office: boolean; readOnly: boolean; units: Parameters<typeof WaterBalanceSection>[0]["units"]; rotation: Data["rotation"] }) {
  const crop = plot.kind === "crop";
  return (
    <>
      {office && crop && <WithdrawalSection plot={plot} />}
      {office && crop && <PhenologySection plotId={plot.id} />}
      {office && crop && (
        <WaterBalanceSection plotId={plot.id} units={units} onIrrigate={readOnly ? null : () => router.push({ pathname: "/annotate", params: { plotId: plot.id, kind: "irrigation" } })} />
      )}
      {office && crop && <ForecastSection plot={plot} units={units} />}
      {office && crop && <RotationSection plotId={plot.id} local={rotation} />}
    </>
  );
}

/** Tareas abiertas y últimas anotaciones del lote. */
export function PlotLists({ tasks, records }: { tasks: Data["tasks"]; records: Data["records"] }) {
  return (
    <>
      {tasks.length > 0 && <SectionHeader title={t("app.plot.sheetTasks")} />}
      {tasks.map((task) => (
        <Row
          key={task.id}
          icon={ListChecks}
          title={task.title}
          subtitle={task.dueDate ? day(Date.parse(`${task.dueDate}T12:00:00-03:00`)) : undefined}
          onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
        />
      ))}

      {records.length > 0 && <SectionHeader title={t("app.plot.sheetRecent")} />}
      {records.map((r) => (
        <Row
          key={r.id}
          icon={RECORD_ICON[r.kind]}
          title={describeRecord(r.kind, JSON.parse(r.data))}
          subtitle={`${t(`record-kinds.kind.${r.kind}`)} · ${day(r.capturedAt)}`}
          onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
        />
      ))}

    </>
  );
}

/** Confirmación escrita para borrar el lote: hay que tipear su nombre. */
export function DeleteSheet({ plot, a }: { plot: Plot; a: ReturnType<typeof usePlotActions> }) {
  const { remove, typed, setTyped, confirming, setConfirming, doDelete } = a;
  return (
    <Sheet visible={confirming} title={t("office.plot.deleteTitle")} onClose={() => setConfirming(false)} avoidKeyboard>
      <Text style={T.body}>{t("office.plot.deleteBody", { name: plot.name })}</Text>
      <View style={{ marginTop: 8 }}>
        <TextField label={t("office.plot.deleteType", { name: plot.name })} value={typed} onChangeText={setTyped} autoCapitalize="none" />
      </View>
      {remove.error ? (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>
          {remove.error}
        </Text>
      ) : null}
      <Button kind="danger" title={t("office.plot.delete")} disabled={typed.trim().toLowerCase() !== plot.name.trim().toLowerCase()} loading={remove.pending} onPress={() => void doDelete()} style={{ marginTop: 16 }} />
      <Button kind="text" title={t("ui.common.cancel")} onPress={() => setConfirming(false)} style={{ marginTop: 4 }} />
    </Sheet>
  );
}
