import { useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { Beef, ClipboardList, Footprints, RefreshCw, Siren, UserRound } from "lucide-react-native";
import { t } from "@yvy/shared";
import { FEATURES } from "../../src/lib/features";
import { getSession } from "../../src/lib/session";
import { canCount } from "../../src/lib/stock-count";
import { useSyncStatus } from "../../src/lib/sync";
import { Row, SectionHeader, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";

export default function More() {
  const sync = useSyncStatus();
  const session = getSession();
  const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

  const [labsOpen, setLabsOpen] = useState(false);
  const labs: { title: string; hint: string; to: string }[] = [
    { title: t("app.labsRustTitle"), hint: t("app.labsRustRow"), to: "/labs/roya" },
    { title: t("app.labsBugsTitle"), hint: t("app.labsBugsRow"), to: "/labs/chinches" },
    { title: t("app.labsGrassTitle"), hint: t("app.labsGrassRow"), to: "/labs/pasto" },
    { title: t("app.labsCowTitle"), hint: t("app.labsCowRow"), to: "/labs/vaca" },
    { title: t("app.labsVoiceTitle"), hint: t("app.labsVoiceRow"), to: "/labs/voz" },
    { title: t("app.labsWeedIdTitle"), hint: t("app.labsWeedIdRow"), to: "/labs/malezas" },
    { title: t("app.labsTagTitle"), hint: t("app.labsTagRow"), to: "/labs/caravana" },
    { title: t("app.labsStageTitle"), hint: t("app.labsStageRow"), to: "/labs/fenologia" },
    { title: t("app.labsTranslateTitle"), hint: t("app.labsTranslateRow"), to: "/labs/guarani" },
  ];

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{session?.user.fullName}</Text>

      <Row icon={Siren} tone="danger" title={t("app.emergencyTitle")} subtitle={t("app.emergencyRowHint")} onPress={() => router.push("/emergency")} />

      <SectionHeader title={t("app.sectionTools")} />
      <Row icon={Footprints} title={t("app.walkRow")} subtitle={t("app.walkRowHint")} onPress={() => router.push("/walk")} />
      <Row icon={Beef} title={t("app.animalsRow")} subtitle={t("app.animalsRowHint")} onPress={() => router.push("/animals")} />
      {canCount(session?.organization.role) && <Row icon={ClipboardList} title={t("ui.countRow")} subtitle={t("ui.countRowHint")} onPress={() => router.push("/stock-count")} />}

      <SectionHeader title={t("app.sectionAccount")} />
      <Row
        icon={RefreshCw}
        title={t("app.syncStorageRow")}
        subtitle={[t("app.lastSyncAt", { when: lastSync }), sync.pending > 0 ? t("app.pendingCount", { n: sync.pending }) : t("app.allSent")].join(" · ")}
        onPress={() => router.push("/sync")}
      />
      <Row icon={UserRound} title={t("app.accountRow")} subtitle={t("app.accountRowHint")} onPress={() => router.push("/account")} />

      {FEATURES.labs && (
        <>
          <SectionHeader title={t("app.labsSection")} action={labsOpen ? t("app.labsHide") : t("app.labsShow")} onAction={() => setLabsOpen((o) => !o)} />
          {labsOpen && labs.map((l) => <Row key={l.to} title={l.title} subtitle={l.hint} onPress={() => router.push(l.to as never)} />)}
        </>
      )}

      <Text style={[T.small, { marginTop: 28, color: C.tinta3 }]}>
        {t("attribution.metNorway")} · {t("attribution.copernicus")} · {t("attribution.chirps")} · {t("attribution.firms")}
      </Text>
    </ScrollView>
  );
}
