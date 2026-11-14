/**
 * Gestión: la oficina en el bolsillo. Solo para dueño, administrador, agrónomo y supervisor (la pestaña no existe para
 * el empleado ni el contratista). El menú sale de `manageNav` en @yvy/shared; los datos, de la API, que es quien
 * aplica los permisos: si el rol no alcanza para algo, el servidor lo rechaza aunque este menú lo mostrara.
 */
import { Pressable, RefreshControl, ScrollView } from "react-native";
import { router } from "expo-router";
import { isAdminRole, manageNav, t, type OwnerDashboard, type ReviewItem, type Role } from "@yvy/shared";
import { fmtNum } from "../../src/lib/format";
import { DASHBOARD_TTL_MS, MANAGE_HREF, withoutMargin } from "../../src/lib/manageRoutes";
import { useOnline } from "../../src/lib/online";
import { useSession } from "../../src/lib/session";
import { Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { StaleBanner } from "../../src/ui/online";
import { Stat, StatGrid } from "../../src/ui/Stat";
import { C, T } from "../../src/ui/theme";

export default function Manage() {
  const session = useSession();
  const role = (session?.organization.role ?? "worker") as Role;
  const groups = manageNav({ role, organizations: session?.organizations?.length ?? 1 });
  const admin = isAdminRole(role);
  const dash = useOnline<OwnerDashboard>(admin ? "/org/dashboard" : null, { ttlMs: DASHBOARD_TTL_MS, forCache: withoutMargin as never });
  const review = useOnline<ReviewItem[]>("/org/review", { ttlMs: DASHBOARD_TTL_MS });
  const toReview = review.data?.length ?? 0;
  const d = dash.data;

  return (
    <ScrollView
      style={k.screen}
      contentContainerStyle={[k.pad, { paddingBottom: 120 }]}
      refreshControl={<RefreshControl refreshing={dash.refreshing || review.refreshing} onRefresh={() => (dash.reload(true), review.reload(true))} tintColor={C.accion} colors={[C.accion]} />}
    >
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{t("app.manage")}</Text>

      {admin && d && (
        <>
          <StaleBanner at={dash.at} offline={dash.offline} ttlMs={DASHBOARD_TTL_MS} />
          <Pressable accessibilityRole="button" accessibilityLabel={t("app.manageSeeDashboard")} onPress={() => router.push("/manage/dashboard")} style={{ marginTop: 8 }}>
            <StatGrid>
              <Stat
                label={t("ui.dashRainMonth")}
                value={d.rain.mm === null ? "—" : fmtNum(d.rain.mm)}
                unit={d.rain.mm === null ? undefined : "mm"}
                note={d.rain.normalMm === null ? undefined : t("ui.dashRainNormal", { normal: fmtNum(d.rain.normalMm), pct: d.rain.pctOfNormal ?? 0 })}
              />
              <Stat label={t("ui.activeAlerts")} value={d.alerts.total} tone={d.alerts.total ? "danger" : undefined} />
              <Stat label={t("ui.dashActivity")} value={`${d.activity.activeWorkers7d}/${d.activity.workers}`} />
              <Stat label={t("ui.dashRecords")} value={d.records7d.total} />
            </StatGrid>
            <Text style={[T.smallMedium, { color: C.accionOscuro, marginTop: 12, minHeight: 32 }]}>{t("app.manageSeeDashboard")}</Text>
          </Pressable>
        </>
      )}

      {groups.map((g, i) => (
        <GroupBlock key={g.id} group={g} first={i === 0 && !(admin && d)} toReview={toReview} />
      ))}
    </ScrollView>
  );
}

function GroupBlock({ group, first, toReview }: { group: ReturnType<typeof manageNav>[number]; first: boolean; toReview: number }) {
  return (
    <>
      <SectionHeader first={first} title={t(group.label)} />
      {group.items.map((it) => (
        <Row
          key={it.id}
          title={t(it.label)}
          subtitle={it.id === "review" && toReview > 0 ? t("app.manageToReview", { n: toReview }) : undefined}
          onPress={() => router.push(MANAGE_HREF[it.id] as never)}
        />
      ))}
    </>
  );
}
