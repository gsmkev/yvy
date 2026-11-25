/** Clientes del agrónomo: GET /me/clients. Tocar una estancia cambia de organización y entra. */
import { useState } from "react";
import { Alert, View } from "react-native";
import { t, type MessageKey, areaLabel, haToArea } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { enterOrganization } from "../../src/lib/enterOrg";
import { getSession } from "../../src/lib/session";
import { canSwitchUser, unsentSummary } from "../../src/lib/switchUser";
import { useUnits } from "../../src/lib/units";
import { fmtDate, fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { Row, SectionHeader, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

interface ClientFarm {
  id: string;
  name: string;
  department: string | null;
  areaHa: number;
  activeAlerts: number;
  lastRecordAt: number | null;
}
interface Client {
  organization: { id: string; name: string; role: string };
  farms: ClientFarm[];
  alerts: { id: string; farmId: string; kind: string; severity: string; summary: string }[];
}
interface Clients {
  clients: Client[];
  truncated: boolean;
}

/** Pantalla de clientes del contador: las organizaciones a las que tiene acceso y el cambio de una a otra. */
export default function ClientsScreen() {
  const q = useOnline<Clients>("/me/clients");
  const units = useUnits();
  const [error, setError] = useState<string | null>(null);
  const current = getSession()?.organization.id;

  const open = (orgId: string) => {
    if (orgId === current) return;
    const block = canSwitchUser(unsentSummary(getDb()));
    if (block.blocked) {
      const key: MessageKey = block.reason === "rejected" ? "office.org.switchBlockedRejected" : "office.org.switchBlockedPending";
      return Alert.alert(t(key, { n: block.n }));
    }
    setError(null);
    enterOrganization(orgId).catch(() => setError(t("office.clients.enterFailed")));
  };

  return (
    <OfficeScreen title={t("ui.clients.title")} query={q}>
      {error && <Text style={[T.small, { color: C.peligro, marginTop: 8 }]}>{error}</Text>}
      <OnlineState query={q} isEmpty={(d) => d.clients.length === 0} empty={{ title: t("ui.clients.none") }}>
        {(d) => (
          <View>
            <Text style={[T.small, { marginTop: 4 }]}>
              {t("ui.clients.summary", { orgs: d.clients.length, alerts: d.clients.reduce((a, c) => a + c.farms.reduce((b, f) => b + f.activeAlerts, 0), 0) })}
            </Text>
            {d.truncated && <Text style={T.small}>{t("ui.clients.truncated")}</Text>}
            {d.clients.map((c) => (
              <View key={c.organization.id}>
                <SectionHeader title={c.organization.name} action={c.organization.id === current ? t("office.clients.current") : t("ui.clients.openOrg")} onAction={() => open(c.organization.id)} />
                {c.farms.length === 0 && <Text style={T.small}>{t("ui.clients.noFarms")}</Text>}
                {c.farms.map((f) => {
                  const alerts = c.alerts.filter((a) => a.farmId === f.id);
                  return (
                    <View key={f.id}>
                      <Row
                        title={f.name}
                        subtitle={[
                          `${fmtNumber(haToArea(f.areaHa, units.area))} ${areaLabel(units.area)}`,
                          f.department,
                          f.lastRecordAt ? `${t("ui.last.record")} ${fmtDate(f.lastRecordAt)}` : t("ui.never.recorded"),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        onPress={() => open(c.organization.id)}
                      />
                      {alerts.map((a) => (
                        <Text key={a.id} style={[T.smallMedium, { color: C.peligro, marginLeft: 4, marginBottom: 4 }]}>
                          {a.summary}
                        </Text>
                      ))}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </OnlineState>
    </OfficeScreen>
  );
}
