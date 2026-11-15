/**
 * Centro de informes (funciones 83-101): puerta de entrada con las mismas entradas agrupadas que la web.
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
    title: "ui.reportsGroupTrack",
    entries: [
      { path: "report", title: "ui.reportTitle", hint: "ui.reportsDescWeekly" },
      { path: "rain-gauges", title: "ui.gaugesTitle", hint: "ui.reportsDescGauges" },
      { path: "changes", title: "ui.changesTitle", hint: "ui.reportsDescChanges" },
    ],
  },
  { title: "ui.reportsGroupThird", entries: [{ path: "share-links", title: "ui.shareLinkTitle", hint: "ui.reportsDescShare", ownerOnly: true }] },
  {
    title: "ui.reportsGroupSeason",
    entries: [
      { path: "risk", title: "ui.riskTitle", hint: "ui.reportsDescRisk" },
      { path: "climate", title: "office.climateTitle", hint: "office.climateHint" },
    ],
  },
];

export default function Reports() {
  const { farms, farm, setFarmId } = useFarmPick();
  const owner = getSession()?.organization.role === "owner";
  return (
    <OfficeScreen title={t("ui.reportsTitle")}>
      {!farm ? (
        <EmptyState title={t("office.reportsNoFarms")} hint={t("office.reportsNoFarmsHint")} />
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
                  <Row key={e.path} title={t(e.title)} subtitle={t(e.hint)} onPress={() => router.push(`/office/${e.path}?farmId=${farm.id}` as never)} />
                ))}
              </View>
            );
          })}
        </>
      )}
    </OfficeScreen>
  );
}
