/** Gestión: el menú de las pantallas de oficina, leído de OFFICE_MENU (src/office/menu.ts). Solo roles de oficina. */
import { Fragment, useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { getSession } from "../../src/lib/session";
import { useLocal } from "../../src/lib/useLocal";
import { groupMenu, GROUP_TITLE, OFFICE_MENU, type MenuCtx } from "../../src/office/menu";
import { isOverdue } from "../../src/lib/teamTasks";
import { StatRow } from "../../src/office/ui";
import { Button, EmptyState, Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { T } from "../../src/ui/theme";

/** Pestaña Gestión: menú de la oficina según el rol. */
export default function Office() {
  const session = getSession();
  const counts = useLocal(() => ({ farms: getDb().farms().length, plots: getDb().plots().length }));
  const ctx: MenuCtx = {
    role: session?.organization.role ?? "",
    ...counts,
    hasClients: (session?.organizations?.length ?? 0) > 1,
  };
  const [all, setAll] = useState<Record<string, boolean>>({});
  // Resumen del día: solo las cifras que no son cero, cada una lleva a su pantalla.
  const sum = useLocal(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = new Date(Date.now() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    return {
      overdue: getDb()
        .openTasks()
        .filter((x) => isOverdue(x, today)).length,
      alerts: getDb().activeAlerts().length,
      records: getDb()
        .records(100)
        .filter((r) => r.capturedAt >= start.getTime()).length,
    };
  });
  const stats = [
    {
      label: t("office.summary.overdue"),
      value: sum.overdue,
      tone: "danger" as const,
      onPress: () => router.push("/office/tasks"),
    },
    { label: t("office.summary.alerts"), value: sum.alerts, onPress: () => router.push("/office/alerts") },
    { label: t("office.summary.records"), value: sum.records, onPress: () => router.push("/(tabs)/history") },
  ].filter((x) => x.value > 0);
  const groups = groupMenu(OFFICE_MENU, ctx);
  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text accessibilityRole="header" style={[T.display, { marginTop: 2 }]}>
        {t("office.common.tab")}
      </Text>
      {stats.length > 0 && <StatRow items={stats} />}
      {groups.length === 0 && <EmptyState title={t("office.menu.empty")} hint={t("office.menu.emptyHint")} />}
      {groups.map((g, i) => (
        <Fragment key={g.group}>
          <SectionHeader first={i === 0} title={t(GROUP_TITLE[g.group])} />
          {(all[g.group] ? g.items : g.items.slice(0, 6)).map((it) => (
            <Row
              key={it.id}
              icon={it.icon}
              title={t(it.title)}
              subtitle={it.hint ? t(it.hint) : undefined}
              onPress={() => router.push(it.href)}
            />
          ))}
          {g.items.length > 6 && (
            <Button
              kind="text"
              title={all[g.group] ? t("office.menu.seeLess") : t("office.menu.seeAll", { n: g.items.length })}
              onPress={() => setAll((a) => ({ ...a, [g.group]: !a[g.group] }))}
            />
          )}
        </Fragment>
      ))}
    </ScrollView>
  );
}
