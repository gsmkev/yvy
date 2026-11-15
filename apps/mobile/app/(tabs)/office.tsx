/** Gestión: el menú de las pantallas de oficina, leído de OFFICE_MENU (src/office/menu.ts). Solo roles de oficina. */
import { Fragment } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { getSession } from "../../src/lib/session";
import { useLocal } from "../../src/lib/useLocal";
import { groupMenu, GROUP_TITLE, OFFICE_MENU, type MenuCtx } from "../../src/office/menu";
import { EmptyState, Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

export default function Office() {
  const session = getSession();
  const counts = useLocal(() => ({ farms: getDb().farms().length, plots: getDb().plots().length }));
  const ctx: MenuCtx = { role: session?.organization.role ?? "", ...counts, hasClients: (session?.organizations?.length ?? 0) > 1 };
  const groups = groupMenu(OFFICE_MENU, ctx);
  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text accessibilityRole="header" style={[T.display, { marginTop: 2 }]}>
        {t("office.tab")}
      </Text>
      {groups.length === 0 && <EmptyState title={t("office.menuEmpty")} hint={t("office.menuEmptyHint")} />}
      {groups.map((g, i) => (
        <Fragment key={g.group}>
          <SectionHeader first={i === 0} title={t(GROUP_TITLE[g.group])} />
          {g.items.map((it) => (
            <Row key={it.id} icon={it.icon} title={t(it.title)} subtitle={it.hint ? t(it.hint) : undefined} onPress={() => router.push(it.href as never)} />
          ))}
        </Fragment>
      ))}
    </ScrollView>
  );
}
