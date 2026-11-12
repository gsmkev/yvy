import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, View } from "react-native";
import { router } from "expo-router";
import { t, type MessageKey } from "@yvy/shared";
import { FEATURES } from "../../src/lib/features";
import type { OutboxItem } from "../../src/db/store";
import { getDb } from "../../src/lib/db";
import { allPacksPlan, downloadAllPacks, downloadPack, isWifi, packStatus } from "../../src/lib/offline";
import { remindersEnabled, setRemindersEnabled } from "../../src/lib/reminders";
import { api, getSession, setSession } from "../../src/lib/session";
import { deleteUploadedFiles, storageUsage, type StorageUsage } from "../../src/lib/storage";
import { canSwitchUser, unsentSummary } from "../../src/lib/switchUser";
import { showToast } from "../../src/lib/toast";
import { localChanged, stopAutoSync, syncNow, syncNowMobileData, useSyncStatus } from "../../src/lib/sync";
import { canCount } from "../../src/lib/stock-count";
import { useLocal } from "../../src/lib/useLocal";
import { Button, Row, s as k, Text } from "../../src/ui/kit";
import { C, F, T } from "../../src/ui/theme";

export default function More() {
  const farms = useLocal(() => getDb().farms());
  const rejected = useLocal(() => getDb().rejected());
  const outbox = useLocal(() => getDb().outboxItems());
  const plots = useLocal(() => getDb().plots());
  const sync = useSyncStatus();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [wifiOnly, setWifiOnly] = useState(getDb().getKv("photos_wifi_only") === "1");
  const [reminders, setReminders] = useState(remindersEnabled());
  const session = getSession();
  const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

  const download = async (farmId: string) => {
    if (!(await isWifi())) return Alert.alert(t("app.offlinePackNeedsWifi"));
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

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]}>
      <Text style={T.small}>{session?.organization.name}</Text>
      <Text style={[T.display, { marginTop: 2 }]}>{session?.user.fullName}</Text>

      <Text style={st.section}>{t("app.syncTitle")}</Text>
      <Row title={t("app.lastSyncAt", { when: lastSync })} subtitle={sync.pending > 0 ? t("app.pendingCount", { n: sync.pending }) : t("app.allSent")} onPress={syncNow} />
      <Outbox items={outbox} plotName={(id) => plots.find((p) => p.id === id)?.name} wifiOnly={wifiOnly} />
      {rejected.map((r) => (
        <View key={r.mutationId} style={st.rejected}>
          <Text style={[T.bodyMedium, { color: C.peligro }]}>{t("app.rejected")}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>{t(`rejectReasons.${r.reason}` as never, { max: 3 })}</Text>
          <Button kind="text" title={t("app.dismiss")} onPress={() => (getDb().dismissRejected(r.mutationId), localChanged())} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        </View>
      ))}

      <Text style={st.section}>{t("app.offlinePack")}</Text>
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
        return <Row key={f.id} title={f.name} subtitle={subtitle} onPress={p.layers.length && !p.upToDate && pct === undefined ? () => download(f.id) : undefined} right={p.layers.length && !p.upToDate && pct === undefined ? <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("app.download")}</Text> : undefined} />;
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
      {farms.length > 1 && plan.farms.length === 0 && plan.withoutImagery < farms.length && <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.offlineAllReady")}</Text>}

      <Storage />

      <View style={[st.switchRow]}>
        <Text style={[T.body, { flex: 1 }]}>{t("app.photosWifiOnly")}</Text>
        <Switch value={wifiOnly} onValueChange={(v) => (setWifiOnly(v), getDb().setKv("photos_wifi_only", v ? "1" : "0"))} trackColor={{ true: C.accion }} />
      </View>

      <View style={st.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={T.body}>{t("app.remindersSwitch")}</Text>
          <Text style={T.small}>{t("app.remindersHint")}</Text>
        </View>
        <Switch
          value={reminders}
          accessibilityLabel={t("app.remindersSwitch")}
          onValueChange={async (v) => {
            const on = await setRemindersEnabled(v);
            setReminders(on);
            if (v && !on) Alert.alert(t("app.remindersDenied"));
          }}
          trackColor={{ true: C.accion }}
        />
      </View>

      <Row title={t("app.walkRow")} subtitle={t("app.walkRowHint")} onPress={() => router.push("/walk")} />
      <Row title={t("app.animalsRow")} subtitle={t("app.animalsRowHint")} onPress={() => router.push("/animals")} />
      {canCount(session?.organization.role) && <Row title={t("ui.countRow")} subtitle={t("ui.countRowHint")} onPress={() => router.push("/stock-count")} />}
      <Row title={t("app.notifRow")} subtitle={t("app.notifRowHint")} onPress={() => router.push("/notifications")} />

      {FEATURES.labs && (
        <>
          <Text style={st.section}>{t("app.labsSection")}</Text>
          <Row title={t("app.labsRustTitle")} subtitle={t("app.labsRustRow")} onPress={() => router.push("/labs/roya")} />
          <Row title={t("app.labsBugsTitle")} subtitle={t("app.labsBugsRow")} onPress={() => router.push("/labs/chinches")} />
          <Row title={t("app.labsGrassTitle")} subtitle={t("app.labsGrassRow")} onPress={() => router.push("/labs/pasto")} />
          <Row title={t("app.labsCowTitle")} subtitle={t("app.labsCowRow")} onPress={() => router.push("/labs/vaca")} />
          <Row title={t("app.labsVoiceTitle")} subtitle={t("app.labsVoiceRow")} onPress={() => router.push("/labs/voz")} />
        </>
      )}

      <Row title={t("app.switchUser")} subtitle={t("app.switchUserHint")} onPress={switchUser} />
      <Button kind="danger" title={t("app.logout")} onPress={logout} style={{ marginTop: 32 }} />
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
function Outbox({ items, plotName, wifiOnly }: { items: OutboxItem[]; plotName: (id: string | null) => string | undefined; wifiOnly: boolean }) {
  const photoBytes = items.reduce((a, i) => a + i.photoBytes, 0);
  const label = (i: OutboxItem) =>
    i.what === "record_delete" ? t("app.outboxRecordDelete") : i.what === "task" ? t("app.outboxTask") : i.what === "poi" ? t("app.outboxPoi") : i.what === "plot" ? t("app.outboxPlot") : i.recordKind ? t(`recordKinds.${i.recordKind}` as MessageKey) : t("app.outboxPhotosOnly");
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={st.sub}>{t("app.outboxTitle")}</Text>
      {items.length === 0 && <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.outboxEmpty")}</Text>}
      {items.slice(0, OUTBOX_SHOWN).map((i) => (
        <Row
          key={i.id}
          title={label(i)}
          subtitle={[plotName(i.plotId), when(i.at), i.photos > 0 ? t("app.outboxPhotoSize", { n: i.photos, size: size(i.photoBytes) }) : null].filter(Boolean).join(" · ")}
        />
      ))}
      {items.length > OUTBOX_SHOWN && <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.outboxMore", { n: items.length - OUTBOX_SHOWN })}</Text>}
      {items.length > 0 && (
        <>
          <Button kind="secondary" title={t("app.outboxSendNow")} onPress={syncNow} style={{ marginTop: 12 }} />
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
  const line = (n: number, bytes: number) => (n === 0 && bytes === 0 ? t("app.storageNone") : t("app.storageCount", { n, size: size(bytes) }));
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
  return (
    <>
      <Text style={st.section}>{t("app.storageTitle")}</Text>
      <Row title={t("app.storagePhotos")} subtitle={line(usage.photos.n, usage.photos.bytes)} />
      <Row title={t("app.storageVoice")} subtitle={line(usage.voice.n, usage.voice.bytes)} />
      <Row title={t("app.storageMaps")} subtitle={line(usage.maps.n, usage.maps.bytes)} />
      <Row title={t("app.storageDb")} subtitle={size(usage.database)} />
      <Button
        kind="secondary"
        title={usage.reclaimable.n > 0 ? t("app.storageDelete", { size: size(usage.reclaimable.bytes) }) : t("app.storageDeleteNothing")}
        disabled={usage.reclaimable.n === 0 || busy}
        loading={busy}
        onPress={free}
        style={{ marginTop: 12 }}
      />
    </>
  );
}

const st = StyleSheet.create({
  sub: { fontFamily: F.sansMedium, fontSize: 15, color: C.tinta2, marginTop: 8 },
  section: { fontFamily: F.sansSemi, fontSize: 15, color: C.tinta2, marginTop: 32, marginBottom: 4 },
  rejected: { backgroundColor: C.peligroSuave, borderRadius: 12, padding: 16, marginTop: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.linea },
});
