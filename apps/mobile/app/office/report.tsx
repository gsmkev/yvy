/**
 * Parte semanal: lo mismo que la web muestra en pantalla (registros, lluvia, avisos, tareas) y, en lugar del PDF,
 * "Compartir por WhatsApp" con un resumen corto. API: /org/records, /org/farms/:id/climate, /org/tasks, /org/alerts.
 */
import { useState } from "react";
import { Linking, Share, View } from "react-native";
import { MessageCircle } from "lucide-react-native";
import { addDays, localDate, t, weeklyShareText, whatsappUrl, mondayOf } from "@yvy/shared";
import { API_URL } from "../../src/lib/session";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { ddmmyyyy, periodOf, useReportData, type Period, type ReportData } from "../../src/office/report/model";
import { ReportBody } from "../../src/office/report/ReportBody";
import { OnlineState } from "../../src/office/state";
import { useUnits } from "../../src/lib/units";
import { DateField, Segmented } from "../../src/office/ui";
import { EmptyState } from "../../src/ui/kit";

/** Manda el resumen por WhatsApp; si no se puede abrir, usa la hoja de compartir del sistema. */
function shareReport(farm: { id: string; name: string }, range: Period, d: ReportData) {
  const text = weeklyShareText({
    farmName: farm.name,
    from: ddmmyyyy(range.from),
    to: ddmmyyyy(range.to),
    records: d.rows.length,
    workers: d.workers,
    rainMm: d.rain,
    alerts: d.periodAlerts.map((a) => a.summary),
    link: `${API_URL}/estancias/${farm.id}/parte?desde=${range.from}&hasta=${range.to}`,
  });
  Linking.openURL(whatsappUrl(text)).catch(() => Share.share({ message: text }).catch(() => undefined));
}

/** Informe de un lote o una estancia. */
export default function Report() {
  const units = useUnits();
  const { farms, farm, setFarmId } = useFarmPick();
  const today = localDate(Date.now());
  const thisMonday = mondayOf(today);
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(today);
  const range = periodOf(from, to);
  const id = farm?.id;
  const data = useReportData(id, range, from, today);

  const preset = from === thisMonday && to === today ? "this" : from === addDays(thisMonday, -7) && to === addDays(thisMonday, -1) ? "last" : "custom";

  return (
    <OfficeScreen
      title={t("ui.report.title")}
      subtitle={farm?.name}
      query={data.records}
      action={{ label: t("ui.share.whatsapp"), icon: MessageCircle, onPress: () => farm && range && shareReport(farm, range, data), disabled: !range || !data.records.data }}
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
        <OnlineState query={data.records} isEmpty={() => false} empty={{ title: t("ui.report.noRecords") }}>
          {() => <ReportBody data={data} units={units} />}
        </OnlineState>
      )}
    </OfficeScreen>
  );
}
