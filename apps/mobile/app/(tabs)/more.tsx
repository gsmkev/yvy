import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { getLocale, LIMITS, LOCALES, LOCALE_NAMES, t, type MessageKey } from "@yvy/shared";
import { FEATURES } from "../../src/lib/features";
import type { OutboxItem } from "../../src/db/store";
import { getDb } from "../../src/lib/db";
import { allPacksPlan, downloadAllPacks, downloadPack, isWifi, mapBudget, packStatus } from "../../src/lib/offline";
import { remindersEnabled, setRemindersEnabled } from "../../src/lib/reminders";
import { chooseLocale } from "../../src/lib/locale";
import { api, getSession, setSession } from "../../src/lib/session";
import { deleteUploadedFiles, storageUsage, type StorageUsage } from "../../src/lib/storage";
import { canSwitchUser, unsentSummary } from "../../src/lib/switchUser";
import { showToast } from "../../src/lib/toast";
import { isOwnerMode } from "../../src/lib/ownerSummary";
import { fitsBudget } from "../../src/lib/offlinePlan";
import { localChanged, stopAutoSync, syncNow, syncNowMobileData, useSyncStatus } from "../../src/lib/sync";
import { canCount } from "../../src/lib/stock-count";
import { useLocal } from "../../src/lib/useLocal";
import { Button, Row, SectionHeader, SwitchRow, s as k, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";
import { setReadOnly, useReadOnly } from "../../src/lib/readOnly";

export default function More() {
  const farms = useLocal(() => getDb().farms());
  const rejected = useLocal(() => getDb().rejected());
  const outbox = useLocal(() => getDb().outboxItems());
  const stuck = useLocal(() => getDb().stuckUploads(LIMITS.photos.maxUploadAttempts));
  const plots = useLocal(() => getDb().plots());
  const sync = useSyncStatus();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [wifiOnly, setWifiOnly] = useState(getDb().getKv("photos_wifi_only") === "1");
  const [reminders, setReminders] = useState(remindersEnabled());
  const session = getSession();
  const readOnly = useReadOnly();
  const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

  const download = async (farmId: string) => {
    if (!(await isWifi())) return Alert.alert(t("app.offlinePackNeedsWifi"));
    if (!fitsBudget(packStatus(farmId).missingBytes, mapBudget())) return Alert.alert(t("app.offlineOverLimit", { mb: Math.round(LIMITS.offline.maxMapBytes / 1e6) }));
    try {
      await downloadPack(farmId, (f) => setProgress((p) => ({ ...p, [farmId]: f })));
      localChanged();
    } catch (e) {
      Alert.alert(String(e));
    } finally {
      setProgress((p) => {
        const { [farmId]: _, ...rest } = p;
        return rest;
      });
    }
  };

  // F-26: bajar los mapas de todas las estancias de una vez (por wifi).
  const [allProgress, setAllProgress] = useState<number | null>(null);
  const plan = allPacksPlan();
  const downloadAll = async () => {
    if (!(await isWifi())) return Alert.alert(t("app.offlinePackNeedsWifi"));
    setAllProgress(0);
    try {
      const { failed } = await downloadAllPacks(setAllProgress);
      localChanged();
      if (failed.length) Alert.alert(t("app.offlineAllFailed", { names: failed.join(", ") }));
    } finally {
      setAllProgress(null);
    }
  };

  /** Cierra la sesión de esta persona. Solo si no queda nada sin mandar (ver lib/switchUser.ts). */
  const leave = async () => {
    const s = getSession();
    if (s) await api("POST", "/auth/logout", { refreshToken: s.refreshToken }, false).catch(() => {});
    stopAutoSync();
    getDb().wipeSynced();
    await setSession(null);
    router.replace("/login");
  };

  const guarded = (then: () => void) => {
    const block = canSwitchUser(unsentSummary(getDb()));
    if (!block.blocked) return then();
    if (block.reason === "rejected") return Alert.alert(t("app.switchBlockedRejected", { n: block.n }));
    Alert.alert(t(block.n === 1 ? "app.switchBlockedPendingOne" : "app.switchBlockedPending", { n: block.n }));
  };

  const logout = () =>
    guarded(() => {
      void leave();
    });

  const switchUser = () =>
    guarded(() =>
      Alert.alert(t("app.switchConfirmTitle"), t("app.switchConfirmBody"), [
        { text: t("ui.cancel"), style: "cancel" },
        { text: t("app.switchConfirmYes"), onPress: () => void leave() },
      ]),
    );

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

      <SectionHeader title={t("app.sectionField")} />
      <Row title={t("app.emergencyTitle")} subtitle={t("app.emergencyRowHint")} onPress={() => router.push("/emergency")} />
      <Row title={t("app.walkRow")} subtitle={t("app.walkRowHint")} onPress={() => router.push("/walk")} />
      <Row title={t("app.animalsRow")} subtitle={t("app.animalsRowHint")} onPress={() => router.push("/animals")} />
      {canCount(session?.organization.role) && <Row title={t("ui.countRow")} subtitle={t("ui.countRowHint")} onPress={() => router.push("/stock-count")} />}

      <SectionHeader title={t("app.sectionTools")} />
      <Row title={t("app.lastSyncAt", { when: lastSync })} subtitle={sync.pending > 0 ? t("app.pendingCount", { n: sync.pending }) : t("app.allSent")} onPress={syncNow} />
      <Outbox items={outbox} plotName={(id) => plots.find((p) => p.id === id)?.name} wifiOnly={wifiOnly} error={sync.error} stuck={stuck} />
      {rejected.map((r) => (
        <View key={r.mutationId} style={st.rejected}>
          <Text style={[T.bodyMedium, { color: C.peligro }]}>{t("app.rejected")}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>{t(`rejectReasons.${r.reason}` as never, { max: 3 })}</Text>
          <Button kind="text" title={t("app.dismiss")} onPress={() => (getDb().dismissRejected(r.mutationId), localChanged())} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        </View>
      ))}
      <SwitchRow title={t("app.photosWifiOnly")} value={wifiOnly} onValueChange={(v) => (setWifiOnly(v), getDb().setKv("photos_wifi_only", v ? "1" : "0"))} />
      {farms.map((f) => {
        const p = packStatus(f.id);
        const pct = progress[f.id];
        const subtitle = !p.layers.length
          ? t("app.offlinePackNone")
          : p.upToDate
            ? t("app.offlinePackReady")
            : pct !== undefined
              ? `${Math.round(pct * 100)} %`
              : t("app.offlinePackSize", { mb: (p.missingBytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }) });
        const canDownload = p.layers.length > 0 && !p.upToDate && pct === undefined;
        return <Row key={f.id} title={`${t("app.offlinePack")}: ${f.name}`} subtitle={subtitle} onPress={canDownload ? () => download(f.id) : undefined} right={canDownload ? <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("app.download")}</Text> : undefined} />;
      })}
      {farms.length > 1 && plan.farms.length > 0 && (
        <Button
          kind="secondary"
          title={allProgress !== null ? `${Math.round(allProgress * 100)} %` : t("app.offlineAll", { n: plan.farms.length, mb: (plan.totalBytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }) })}
          loading={allProgress !== null}
          onPress={downloadAll}
          style={{ marginTop: 12 }}
        />
      )}
      {plan.overBudget.length > 0 && (
        <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.offlineOverLimitFarms", { names: plan.overBudget.map((f) => f.name).join(", "), mb: Math.round(LIMITS.offline.maxMapBytes / 1e6) })}</Text>
      )}
      <Storage />

      <SectionHeader title={t("app.sectionAccount")} />
      <Row title={t("app.notifRow")} subtitle={t("app.notifRowHint")} onPress={() => router.push("/notifications")} />
      <SwitchRow
        title={t("app.remindersSwitch")}
        hint={t("app.remindersHint")}
        value={reminders}
        onValueChange={async (v) => {
          const on = await setRemindersEnabled(v);
          setReminders(on);
          if (v && !on) Alert.alert(t("app.remindersDenied"));
        }}
      />
      {isOwnerMode(session?.organization.role) && <SwitchRow title={t("app.readOnlySwitch")} hint={t("app.readOnlyHint")} value={readOnly} onValueChange={setReadOnly} />}
      <Row
        title={t("app.language")}
        subtitle={LOCALE_NAMES[getLocale()]}
        onPress={() =>
          Alert.alert(
            t("app.languageChoose"),
            undefined,
            LOCALES.map((l) => ({
              text: LOCALE_NAMES[l],
              onPress: () => {
                chooseLocale(getDb(), l);
                router.replace("/");
              },
            })),
          )
        }
      />
      <Row title={t("app.switchUser")} subtitle={t("app.switchUserHint")} onPress={switchUser} />
      <Button kind="danger" title={t("app.logout")} onPress={logout} style={{ marginTop: 16 }} />

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

const OUTBOX_SHOWN = 8;
const size = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const when = (ms: number) => new Date(ms).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Cola de envío (F-18): qué falta mandar, cuánto pesan las fotos y cómo mandarlo ya. */
function Outbox({
  items,
  plotName,
  wifiOnly,
  error,
  stuck,
}: {
  items: OutboxItem[];
  plotName: (id: string | null) => string | undefined;
  wifiOnly: boolean;
  error: string | null;
  stuck: { n: number; bytes: number };
}) {
  const photoBytes = items.reduce((a, i) => a + i.photoBytes, 0);
  const retryStuck = () => {
    getDb().retryStuckUploads(LIMITS.photos.maxUploadAttempts);
    localChanged();
    void syncNow();
  };
  const label = (i: OutboxItem) =>
    i.what === "record_delete" ? t("app.outboxRecordDelete") : i.what === "task" ? t("app.outboxTask") : i.what === "poi" ? t("app.outboxPoi") : i.what === "plot" ? t("app.outboxPlot") : i.recordKind ? t(`recordKinds.${i.recordKind}` as MessageKey) : t("app.outboxPhotosOnly");
  return (
    <View>
      {items.length > 0 && (
        <Text style={[T.smallMedium, { paddingVertical: 6 }]}>
          {photoBytes > 0 ? t("app.outboxSummary", { n: items.length, size: size(photoBytes) }) : t("app.outboxSummaryNoPhotos", { n: items.length })}
        </Text>
      )}
      {error && <Text style={[T.small, { color: C.peligro, paddingVertical: 4 }]}>{error === "cpu" ? t("app.outboxErrorCpu") : t("app.outboxError")}</Text>}
      {items.slice(0, OUTBOX_SHOWN).map((i) => (
        <Row
          key={i.id}
          title={label(i)}
          subtitle={[plotName(i.plotId), when(i.at), i.photos > 0 ? t("app.outboxPhotoSize", { n: i.photos, size: size(i.photoBytes) }) : null, i.photos > 0 && wifiOnly ? t("app.outboxWaitingWifi") : null].filter(Boolean).join(" · ")}
        />
      ))}
      {items.length > OUTBOX_SHOWN && <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.outboxMore", { n: items.length - OUTBOX_SHOWN })}</Text>}
      {stuck.n > 0 && (
        <>
          <Text style={[T.small, { paddingVertical: 6 }]}>{t("app.outboxStuck", { n: stuck.n, size: size(stuck.bytes) })}</Text>
          <Button kind="secondary" title={t("app.outboxStuckRetry")} onPress={retryStuck} style={{ marginTop: 4 }} />
        </>
      )}
      {items.length > 0 && (
        <>
          <Button kind="secondary" title={error ? t("app.outboxRetry") : t("app.outboxSendNow")} onPress={syncNow} style={{ marginTop: 12 }} />
          {photoBytes > 0 && wifiOnly && (
            <>
              <Button kind="text" title={t("app.outboxSendMobile")} onPress={syncNowMobileData} style={{ marginTop: 4 }} />
              <Text style={T.small}>{t("app.outboxMobileHint")}</Text>
            </>
          )}
        </>
      )}
    </View>
  );
}

/** Uso de almacenamiento (F-19) y "Borrar fotos ya subidas". */
function Storage() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const { version } = useSyncStatus();
  const refresh = useCallback(() => storageUsage().then(setUsage, () => setUsage(null)), []);
  useEffect(() => {
    void refresh();
  }, [version, refresh]);
  if (!usage) return null;
  const free = () =>
    Alert.alert(t("app.storageDeleteTitle"), t("app.storageDeleteBody", { size: size(usage.reclaimable.bytes) }), [
      { text: t("ui.cancel"), style: "cancel" },
      {
        text: t("app.storageDeleteConfirm"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const r = await deleteUploadedFiles();
          setBusy(false);
          showToast(t("app.storageDeleted", { size: size(r.bytes) }));
          await refresh();
        },
      },
    ]);
  const parts = [
    usage.photos.n > 0 ? `${t("app.storagePhotos")} ${size(usage.photos.bytes)}` : null,
    usage.voice.n > 0 ? `${t("app.storageVoice")} ${size(usage.voice.bytes)}` : null,
    usage.maps.n > 0 ? `${t("app.storageMaps")} ${size(usage.maps.bytes)}` : null,
    `${t("app.storageDb")} ${size(usage.database)}`,
  ].filter(Boolean);
  return (
    <>
      <Row title={t("app.storageTitle")} subtitle={parts.join(" · ")} />
      {usage.reclaimable.n > 0 && <Button kind="secondary" title={t("app.storageDelete", { size: size(usage.reclaimable.bytes) })} disabled={busy} loading={busy} onPress={free} style={{ marginTop: 12 }} />}
    </>
  );
}

const st = StyleSheet.create({
  rejected: { backgroundColor: C.peligroSuave, borderRadius: 12, padding: 16, marginTop: 12 },
});
