/** Comparar estancias: una tarjeta por estancia con las métricas de los últimos 30 días. API: GET /org/compare/farms. */
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

/** Comparación entre estancias de la organización. */
export default function Compare() {
  const allowed = !isFieldRole(getSession()?.organization.role ?? "");
  const q = useOnline<FarmRow[]>(allowed ? "/org/compare/farms" : null);
  return (
    <OfficeScreen title={t("ui.compare.title")} subtitle={t("office.compare.hint")} query={q}>
      <OnlineState query={q} isEmpty={(d) => d.length < 2} empty={{ title: t("ui.compare.needTwoFarms"), hint: t("ui.compare.needTwoFarmsHint") }}>
        {(rows) =>
          rows.map((r) => {
            const lines = [
              { label: t("ui.common.area"), value: `${fmtNumber(r.areaHa)} ha` },
              { label: t("ui.common.plots"), value: String(r.plots) },
              ...(r.rain30Mm !== null ? [{ label: t("ui.compare.rain30"), value: `${fmtNumber(r.rain30Mm)} mm` }] : []),
              ...(r.ndvi30 !== null ? [{ label: t("ui.compare.ndvi30"), value: fmtNumber(r.ndvi30, 2) }] : []),
              ...(r.records30d > 0 ? [{ label: t("ui.compare.records30"), value: String(r.records30d) }] : []),
              ...(r.activeAlerts > 0 ? [{ label: t("ui.compare.alerts"), value: String(r.activeAlerts) }] : []),
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
