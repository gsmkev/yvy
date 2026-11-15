/** Comparar estancias (función 101): una tarjeta por estancia con las métricas de los últimos 30 días. API: GET /org/compare/farms. */
import { View } from "react-native";
import { isFieldRole, t } from "@yvy/shared";
import { getSession } from "../../src/lib/session";
import { fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { KeyValue } from "../../src/office/ui";
import { Text } from "../../src/ui/kit";
import { C, RADIUS, T } from "../../src/ui/theme";

interface FarmRow {
  id: string;
  name: string;
  areaHa: number;
  plots: number;
  records30d: number;
  rain30Mm: number | null;
  ndvi30: number | null;
  activeAlerts: number;
}

export default function Compare() {
  const allowed = !isFieldRole(getSession()?.organization.role ?? "");
  const q = useOnline<FarmRow[]>(allowed ? "/org/compare/farms" : null);
  return (
    <OfficeScreen title={t("ui.compareTitle")} subtitle={t("office.compareHint")} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.length < 2} empty={{ title: t("ui.compareNeedTwoFarms"), hint: t("ui.compareNeedTwoFarmsHint") }}>
        {(rows) =>
          rows.map((r) => {
            const lines = [
              { label: t("ui.area"), value: `${fmtNumber(r.areaHa)} ha` },
              { label: t("ui.plots"), value: String(r.plots) },
              ...(r.rain30Mm !== null ? [{ label: t("ui.compareRain30"), value: `${fmtNumber(r.rain30Mm)} mm` }] : []),
              ...(r.ndvi30 !== null ? [{ label: t("ui.compareNdvi30"), value: fmtNumber(r.ndvi30, 2) }] : []),
              ...(r.records30d > 0 ? [{ label: t("ui.compareRecords30"), value: String(r.records30d) }] : []),
              ...(r.activeAlerts > 0 ? [{ label: t("ui.compareAlerts"), value: String(r.activeAlerts) }] : []),
            ];
            return (
              <View key={r.id} style={{ marginTop: 16, padding: 16, borderRadius: RADIUS, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea }}>
                <Text style={T.heading}>{r.name}</Text>
                <KeyValue rows={lines} />
              </View>
            );
          })
        }
      </OnlineState>
    </OfficeScreen>
  );
}
