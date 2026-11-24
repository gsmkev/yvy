/**
 * Estancias (función 18): lista con resumen de cada una, desde la base local (anda sin señal).
 * Tocar una la elige como estancia actual y abre el Mapa.
 */
import { router } from "expo-router";
import { Trees } from "lucide-react-native";
import { t, areaLabel, haToArea } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { summarizeFarms } from "../../src/lib/farmSummary";
import { setSelectedFarm } from "../../src/lib/farmFilter";
import { useUnits } from "../../src/lib/units";
import { useLocal } from "../../src/lib/useLocal";
import { fmtDate, fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { DataList } from "../../src/office/ui";
import { C, T } from "../../src/ui/theme";
import { Text } from "../../src/ui/kit";

export default function Farms() {
  const units = useUnits();
  const rows = useLocal(() => {
    const db = getDb();
    return summarizeFarms(db.farms(), db.plots(), db.records(500), db.activeAlerts(), Date.now());
  });
  return (
    <OfficeScreen title={t("ui.farmsTitle")}>
      <DataList
        rows={rows}
        keyOf={(f) => f.id}
        icon={Trees}
        title={(f) => f.name}
        subtitle={(f) =>
          [
            t("office.farmsPlotsLine", { plots: f.plots, records: f.records7d }),
            f.lastRecordAt ? t("office.farmsLastRecord", { date: fmtDate(f.lastRecordAt) }) : t("ui.neverRecorded"),
          ].join(" · ")
        }
        right={(f) => (
          <>
            <Text style={[T.bodyMedium, { textAlign: "right" }]}>{`${fmtNumber(haToArea(f.areaHa, units.area))} ${areaLabel(units.area)}`}</Text>
            {f.alerts > 0 && <Text style={[T.smallMedium, { color: C.peligro, textAlign: "right" }]}>{t("office.farmsAlertsLine", { n: f.alerts })}</Text>}
          </>
        )}
        onPress={(f) => {
          setSelectedFarm(f.id);
          router.navigate("/(tabs)/map");
        }}
        empty={{ title: t("office.farmsEmpty"), hint: t("office.farmsEmptyHint") }}
      />
    </OfficeScreen>
  );
}
