/** Selector de organización: para quien tiene más de una (por ejemplo el agrónomo con varios clientes). */
import { useState } from "react";
import { ScrollView } from "react-native";
import { router, Stack } from "expo-router";
import { t, type MessageKey } from "@yvy/shared";
import { enterOrganization } from "../src/lib/enterOrg";
import { orgOptions } from "../src/lib/orgSwitch";
import { useSession } from "../src/lib/session";
import { RadioGroup, Row, s as k, Text } from "../src/ui/kit";
import { C, T } from "../src/ui/theme";

export default function Orgs() {
  const session = useSession();
  const options = orgOptions(session);
  const current = session?.organization.id;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (id: string) => {
    setBusy(true);
    setError(null);
    setError(await enterOrganization(id));
    setBusy(false);
  };
  return (
    <ScrollView style={k.screen} contentContainerStyle={k.pad}>
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.orgSwitchTitle")}</Text>
      {error && <Text accessibilityRole="alert" style={[T.body, { color: C.peligro, marginTop: 12 }]}>{error}</Text>}
      <RadioGroup label={t("app.orgSwitchTitle")}>
        {options.map((o) => (
          <Row key={o.id} choice="radio" title={o.name} subtitle={t(`ui.role_${o.role}` as MessageKey)} selected={o.id === current} disabled={busy} onPress={o.id === current ? () => router.back() : () => void pick(o.id)} />
        ))}
      </RadioGroup>
    </ScrollView>
  );
}
