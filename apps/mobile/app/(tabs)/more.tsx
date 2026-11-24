/** Pestaña Más: emergencia, laboratorios, sincronización y cuenta. */
import { useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { Beef, ClipboardList, Footprints, RefreshCw, Siren, UserRound } from "lucide-react-native";
import { t, ATTRIBUTION } from "@yvy/shared";
import { FEATURES } from "../../src/lib/features";
import { getSession } from "../../src/lib/session";
import { canCount } from "../../src/lib/stock-count";
import { useSyncStatus } from "../../src/lib/sync";
import { Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

/** Pantalla de la pestaña Más. */
export default function More() {
  const sync = useSyncStatus();
  const session = getSession();
  const lastSync = sync.lastSyncAt
    ? new Date(sync.lastSyncAt).toLocaleString("es-PY", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

  const [labsOpen, setLabsOpen] = useState(false);
  const labs: { title: string; hint: string; to: string }[] = [
    { title: t("app.labs.rustTitle"), hint: t("app.labs.rustRow"), to: "/labs/roya" },
    { title: t("app.labs.bugsTitle"), hint: t("app.labs.bugsRow"), to: "/labs/chinches" },
    { title: t("app.labs.grassTitle"), hint: t("app.labs.grassRow"), to: "/labs/pasto" },
    { title: t("app.labs.cowTitle"), hint: t("app.labs.cowRow"), to: "/labs/vaca" },
    { title: t("app.labs.voiceTitle"), hint: t("app.labs.voiceRow"), to: "/labs/voz" },
    { title: t("app.labs.weedIdTitle"), hint: t("app.labs.weedIdRow"), to: "/labs/malezas" },
    { title: t("app.labs.tagTitle"), hint: t("app.labs.tagRow"), to: "/labs/caravana" },
    { title: t("app.labs.stageTitle"), hint: t("app.labs.stageRow"), to: "/labs/fenologia" },
    { title: t("app.labs.translateTitle"), hint: t("app.labs.translateRow"), to: "/labs/guarani" },
  ];

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{session?.user.fullName}</Text>

      <Row
        icon={Siren}
        tone="danger"
        title={t("app.emergency.title")}
        subtitle={t("app.emergency.rowHint")}
        onPress={() => router.push("/emergency")}
      />

      <SectionHeader title={t("app.section.tools")} />
      <Row
        icon={Footprints}
        title={t("app.walk.row")}
        subtitle={t("app.walk.rowHint")}
        onPress={() => router.push("/walk")}
      />
      <Row
        icon={Beef}
        title={t("app.animals.row")}
        subtitle={t("app.animals.rowHint")}
        onPress={() => router.push("/animals")}
      />
      {canCount(session?.organization.role) && (
        <Row
          icon={ClipboardList}
          title={t("ui.count.row")}
          subtitle={t("ui.count.rowHint")}
          onPress={() => router.push("/stock-count")}
        />
      )}

      <SectionHeader title={t("app.section.account")} />
      <Row
        icon={RefreshCw}
        title={t("app.common.syncStorageRow")}
        subtitle={[
          t("app.last.syncAt", { when: lastSync }),
          sync.pending > 0 ? t("app.common.pendingCount", { n: sync.pending }) : t("app.common.allSent"),
        ].join(" · ")}
        onPress={() => router.push("/sync")}
      />
      <Row
        icon={UserRound}
        title={t("app.account.row")}
        subtitle={t("app.account.rowHint")}
        onPress={() => router.push("/account")}
      />

      {FEATURES.labs && (
        <>
          <SectionHeader
            title={t("app.labs.section")}
            action={labsOpen ? t("app.labs.hide") : t("app.labs.show")}
            onAction={() => setLabsOpen((o) => !o)}
          />
          {labsOpen &&
            labs.map((l) => <Row key={l.to} title={l.title} subtitle={l.hint} onPress={() => router.push(l.to)} />)}
        </>
      )}

      <Text style={[T.small, { marginTop: 28, color: C.tinta3 }]}>
        {t(ATTRIBUTION.metNorway)} · {t(ATTRIBUTION.copernicus)} · {t(ATTRIBUTION.chirps)} · {t(ATTRIBUTION.firms)}
      </Text>
    </ScrollView>
  );
}
