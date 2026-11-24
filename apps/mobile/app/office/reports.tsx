/**
 * Centro de informes: puerta de entrada con las mismas entradas agrupadas que la web.
 * En el teléfono no se generan PDF: los informes se leen en pantalla y se comparten por enlace de solo lectura o texto.
 */
import { View } from "react-native";
import { router } from "expo-router";
import { t, type MessageKey } from "@yvy/shared";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { getSession } from "../../src/lib/session";
import { Row, SectionHeader, EmptyState } from "../../src/ui/kit";

interface Entry {
  path: string;
  title: MessageKey;
  hint: MessageKey;
  ownerOnly?: boolean;
}
const GROUPS: { title: MessageKey; entries: Entry[] }[] = [
  {
    title: "ui.reports.groupTrack",
    entries: [
      { path: "report", title: "ui.report.title", hint: "ui.reports.descWeekly" },
      { path: "rain-gauges", title: "ui.gauges.title", hint: "ui.reports.descGauges" },
      { path: "changes", title: "ui.changes.title", hint: "ui.reports.descChanges" },
    ],
  },
  { title: "ui.reports.groupThird", entries: [{ path: "share-links", title: "ui.share.linkTitle", hint: "ui.reports.descShare", ownerOnly: true }] },
  {
    title: "ui.reports.groupSeason",
    entries: [
      { path: "risk", title: "ui.risk.title", hint: "ui.reports.descRisk" },
      { path: "climate", title: "office.climate.title", hint: "office.climate.hint" },
    ],
  },
];

/** Menú de informes de la organización. */
export default function Reports() {
  const { farms, farm, setFarmId } = useFarmPick();
  const owner = getSession()?.organization.role === "owner";
  return (
    <OfficeScreen title={t("ui.reports.title")}>
      {!farm ? (
        <EmptyState title={t("office.reports.noFarms")} hint={t("office.reports.noFarmsHint")} />
      ) : (
        <>
          <FarmChips farms={farms} value={farm.id} onChange={setFarmId} />
          {GROUPS.map((g) => {
            const entries = g.entries.filter((e) => !e.ownerOnly || owner);
            if (!entries.length) return null;
            return (
              <View key={g.title}>
                <SectionHeader title={t(g.title)} />
                {entries.map((e) => (
                  <Row key={e.path} title={t(e.title)} subtitle={t(e.hint)} onPress={() => router.push(`/office/${e.path}?farmId=${farm.id}`)} />
                ))}
              </View>
            );
          })}
        </>
      )}
    </OfficeScreen>
  );
}
