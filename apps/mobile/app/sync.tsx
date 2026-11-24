/** Sincronización y almacenamiento: qué falta mandar, fotos, mapas sin conexión y espacio usado. */
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { LIMITS, t, tk, type MessageKey } from "@yvy/shared";
import type { OutboxItem } from "../src/db/store";
import { getDb } from "../src/lib/db";
import { allPacksPlan, downloadAllPacks, downloadPack, isWifi, mapBudget, packStatus } from "../src/lib/offline";
import { deleteUploadedFiles, storageUsage, type StorageUsage } from "../src/lib/storage";
import { showToast } from "../src/lib/toast";
import { fitsBudget } from "../src/lib/offlinePlan";
import { localChanged, syncNow, syncNowMobileData, useSyncStatus } from "../src/lib/sync";
import { useLocal } from "../src/lib/useLocal";
import { Button, Row, SectionHeader, SwitchRow, s as k, Text } from "../src/ui/kit";
import { C, T } from "../src/ui/theme";

export default function SyncScreen() {
  const farms = useLocal(() => getDb().farms());
  const rejected = useLocal(() => getDb().rejected());
  const outbox = useLocal(() => getDb().outboxItems());
  const stuck = useLocal(() => getDb().stuckUploads(LIMITS.photos.maxUploadAttempts));
  const plots = useLocal(() => getDb().plots());
  const sync = useSyncStatus();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [wifiOnly, setWifiOnly] = useState(getDb().getKv("photos_wifi_only") === "1");
  const lastSync = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString("es-PY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

  const download = async (farmId: string) => {
    if (!(await isWifi())) return Alert.alert(t("app.offline.packNeedsWifi"));
    if (!fitsBudget(packStatus(farmId).missingBytes, mapBudget())) return Alert.alert(t("app.offline.overLimit", { mb: Math.round(LIMITS.offline.maxMapBytes / 1e6) }));
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
    if (!(await isWifi())) return Alert.alert(t("app.offline.packNeedsWifi"));
    setAllProgress(0);
    try {
      const { failed } = await downloadAllPacks(setAllProgress);
      localChanged();
      if (failed.length) Alert.alert(t("app.offline.allFailed", { names: failed.join(", ") }));
    } finally {
      setAllProgress(null);
    }
  };

  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 80 }]}>
      <Text style={T.title}>{t("app.common.syncStorageRow")}</Text>

      <SectionHeader first title={t("app.section.sync")} />
      <Row chevron={false} title={t("app.last.syncAt", { when: lastSync })} subtitle={sync.pending > 0 ? t("app.common.pendingCount", { n: sync.pending }) : t("app.common.allSent")} onPress={syncNow} />
      <Outbox items={outbox} plotName={(id) => plots.find((p) => p.id === id)?.name} wifiOnly={wifiOnly} error={sync.error} stuck={stuck} />
      {rejected.map((r) => (
        <View key={r.mutationId} style={st.rejected}>
          <Text style={[T.bodyMedium, { color: C.peligro }]}>{t("app.common.rejected")}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>{tk(`reject-reasons.reason.${r.reason}`, { max: 3 })}</Text>
          <Button kind="text" title={t("app.common.dismiss")} onPress={() => (getDb().dismissRejected(r.mutationId), localChanged())} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        </View>
      ))}
      <SwitchRow title={t("app.photos.wifiOnly")} value={wifiOnly} onValueChange={(v) => (setWifiOnly(v), getDb().setKv("photos_wifi_only", v ? "1" : "0"))} />
      {farms.map((f) => {
        const p = packStatus(f.id);
        const pct = progress[f.id];
        const subtitle = !p.layers.length
          ? t("app.offline.packNone")
          : p.upToDate
            ? t("app.offline.packReady")
            : pct !== undefined
              ? `${Math.round(pct * 100)} %`
              : t("app.offline.packSize", { mb: (p.missingBytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }) });
        const canDownload = p.layers.length > 0 && !p.upToDate && pct === undefined;
        return <Row key={f.id} title={`${t("app.offline.pack")}: ${f.name}`} subtitle={subtitle} onPress={canDownload ? () => download(f.id) : undefined} right={canDownload ? <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("app.common.download")}</Text> : undefined} />;
      })}
      {farms.length > 1 && plan.farms.length > 0 && (
        <Button
          kind="secondary"
          title={allProgress !== null ? `${Math.round(allProgress * 100)} %` : t("app.offline.all", { n: plan.farms.length, mb: (plan.totalBytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }) })}
          loading={allProgress !== null}
          onPress={downloadAll}
          style={{ marginTop: 12 }}
        />
      )}
      {plan.overBudget.length > 0 && (
        <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.offline.overLimitFarms", { names: plan.overBudget.map((f) => f.name).join(", "), mb: Math.round(LIMITS.offline.maxMapBytes / 1e6) })}</Text>
      )}
      <Storage />

    </ScrollView>
  );
}

const OUTBOX_SHOWN = 8;
const size = (bytes: number) =>
  bytes >= 1e6
    ? (bytes / 1e6).toLocaleString("es-PY", { maximumFractionDigits: 1 }) + " MB"
    : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
const when = (ms: number) =>
  new Date(ms).toLocaleString("es-PY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

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
    i.what === "record_delete" ? t("app.outbox.recordDelete") : i.what === "task" ? t("app.outbox.task") : i.what === "poi" ? t("app.outbox.poi") : i.what === "plot" ? t("app.outbox.plot") : i.recordKind ? t(`record-kinds.kind.${i.recordKind}` as MessageKey) : t("app.outbox.photosOnly");
  return (
    <View>
      {items.length > 0 && (
        <Text style={[T.smallMedium, { paddingVertical: 6 }]}>
          {photoBytes > 0 ? t("app.outbox.summary", { n: items.length, size: size(photoBytes) }) : t("app.outbox.summaryNoPhotos", { n: items.length })}
        </Text>
      )}
      {error && <Text style={[T.small, { color: C.peligro, paddingVertical: 4 }]}>{error === "cpu" ? t("app.outbox.errorCpu") : t("app.outbox.error")}</Text>}
      {items.slice(0, OUTBOX_SHOWN).map((i) => (
        <Row
          key={i.id}
          title={label(i)}
          subtitle={[plotName(i.plotId), when(i.at), i.photos > 0 ? t("app.outbox.photoSize", { n: i.photos, size: size(i.photoBytes) }) : null, i.photos > 0 && wifiOnly ? t("app.outbox.waitingWifi") : null].filter(Boolean).join(" · ")}
        />
      ))}
      {items.length > OUTBOX_SHOWN && <Text style={[T.small, { paddingVertical: 8 }]}>{t("app.outbox.more", { n: items.length - OUTBOX_SHOWN })}</Text>}
      {stuck.n > 0 && (
        <>
          <Text style={[T.small, { paddingVertical: 6 }]}>{t("app.outbox.stuck", { n: stuck.n, size: size(stuck.bytes) })}</Text>
          <Button kind="secondary" title={t("app.outbox.stuckRetry")} onPress={retryStuck} style={{ marginTop: 4 }} />
        </>
      )}
      {items.length > 0 && (
        <>
          <Button kind="secondary" title={error ? t("app.outbox.retry") : t("app.outbox.sendNow")} onPress={syncNow} style={{ marginTop: 12 }} />
          {photoBytes > 0 && wifiOnly && (
            <>
              <Button kind="text" title={t("app.outbox.sendMobile")} onPress={syncNowMobileData} style={{ marginTop: 4 }} />
              <Text style={T.small}>{t("app.outbox.mobileHint")}</Text>
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
    Alert.alert(t("app.storage.deleteTitle"), t("app.storage.deleteBody", { size: size(usage.reclaimable.bytes) }), [
      { text: t("ui.common.cancel"), style: "cancel" },
      {
        text: t("app.storage.deleteConfirm"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const r = await deleteUploadedFiles();
          setBusy(false);
          showToast(t("app.storage.deleted", { size: size(r.bytes) }));
          await refresh();
        },
      },
    ]);
  const parts = [
    usage.photos.n > 0 ? `${t("app.storage.photos")} ${size(usage.photos.bytes)}` : null,
    usage.voice.n > 0 ? `${t("app.storage.voice")} ${size(usage.voice.bytes)}` : null,
    usage.maps.n > 0 ? `${t("app.storage.maps")} ${size(usage.maps.bytes)}` : null,
    `${t("app.storage.db")} ${size(usage.database)}`,
  ].filter(Boolean);
  return (
    <>
      <Row title={t("app.storage.title")} subtitle={parts.join(" · ")} />
      {usage.reclaimable.n > 0 && <Button kind="secondary" title={t("app.storage.delete", { size: size(usage.reclaimable.bytes) })} disabled={busy} loading={busy} onPress={free} style={{ marginTop: 12 }} />}
    </>
  );
}

const st = StyleSheet.create({
  rejected: { backgroundColor: C.peligroSuave, borderRadius: 12, padding: 16, marginTop: 12 },
});
