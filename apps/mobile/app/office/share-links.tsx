/**
 * Enlaces de solo lectura (solo dueño): lista de vigentes, crear por 7 o 30 días, compartir y revocar.
 * Reemplaza al PDF en el teléfono. API: GET/POST /org/farms/:id/share-links, DELETE /org/share-links/:id.
 */
import { useState } from "react";
import { Linking, Share, View } from "react-native";
import { Share2 } from "lucide-react-native";
import { t, whatsappUrl } from "@yvy/shared";
import { API_URL, getSession } from "../../src/lib/session";
import { showToast } from "../../src/lib/toast";
import { FarmChips, useFarmPick } from "../../src/office/farmPick";
import { fmtDate } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { Button, EmptyState, Row, SectionHeader, Sheet, Text } from "../../src/ui/kit";
import { C, RADIUS, T } from "../../src/ui/theme";

interface LinkRow {
  id: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

/** Enlaces para compartir información con terceros. */
export default function ShareLinks() {
  const owner = getSession()?.organization.role === "owner";
  const { farms, farm, setFarmId } = useFarmPick();
  const id = farm?.id;
  const path = id ? `/org/farms/${id}/share-links` : null;
  const links = useOnline<LinkRow[]>(owner ? path : null);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: number } | null>(null);
  const [revoking, setRevoking] = useState<LinkRow | null>(null);
  const create = useOnlineMutation<{ days: number }, { token: string }>("POST", path ?? "/", { invalidate: path ? [path] : [] });
  const revoke = useOnlineMutation<{ id: string }, { ok: boolean }>("DELETE", (b) => `/org/share-links/${b.id}`, { invalidate: path ? [path] : [] });

  if (!owner) return <OfficeScreen title={t("ui.share.linkTitle")}><EmptyState title={t("office.share.linksOwnerOnly")} /></OfficeScreen>;

  const make = async (days: number) => {
    const r = await create.mutate({ days });
    if (r.ok) {
      setFresh({ url: `${API_URL}/compartido/${r.data.token}`, expiresAt: Date.now() + days * 86_400_000 });
      showToast(t("ui.toast.shareCreated"));
    }
  };
  const text = (url: string, expiresAt: number) => t("office.share.linksShareText", { farm: farm?.name ?? "", date: fmtDate(expiresAt), link: url });
  const shareText = (url: string, expiresAt: number) => Share.share({ message: text(url, expiresAt) }).catch(() => undefined);
  const whatsapp = (url: string, expiresAt: number) => Linking.openURL(whatsappUrl(text(url, expiresAt))).catch(() => shareText(url, expiresAt));

  const now = Date.now();
  return (
    <OfficeScreen
      title={t("ui.share.linkTitle")}
      subtitle={farm?.name}
      query={links}
      action={{ label: t("ui.share.linkCreate7"), onPress: () => void make(7), loading: create.pending, disabled: !id }}
      footer={<Button kind="secondary" title={t("ui.share.linkCreate30")} disabled={create.pending || !id} onPress={() => void make(30)} style={{ marginTop: 8 }} />}
    >
      <FarmChips farms={farms} value={id} onChange={setFarmId} />
      <Text style={[T.small, { marginTop: 12 }]}>{t("ui.share.linkIntro")}</Text>
      {create.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{create.error}</Text> : null}
      {fresh && (
        <View style={{ marginTop: 16, padding: 16, borderRadius: RADIUS, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, borderLeftWidth: 4, borderLeftColor: C.lineaFuerte }}>
          <Text style={T.heading}>{t("office.share.linksNewTitle")}</Text>
          <Text selectable style={[T.small, { marginTop: 4 }]}>{fresh.url}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("ui.share.linkNewNote")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Button title={t("office.share.linksShare")} icon={Share2} onPress={() => void whatsapp(fresh.url, fresh.expiresAt)} />
            <Button kind="secondary" title={t("ui.share.linkCopy")} onPress={() => void shareText(fresh.url, fresh.expiresAt)} />
          </View>
        </View>
      )}
      <OnlineState query={links} isEmpty={(l) => l.filter((x) => x.revokedAt === null && x.expiresAt > now).length === 0} empty={{ title: t("office.share.linksNone"), hint: t("office.share.linksNoneHint") }}>
        {(list) => (
          <>
            <SectionHeader title={t("ui.share.linkList")} />
            {list
              .filter((l) => l.revokedAt === null && l.expiresAt > now)
              .map((l) => (
                <Row key={l.id} title={t("ui.share.linkActive", { date: fmtDate(l.expiresAt) })} subtitle={fmtDate(l.createdAt)} chevron={false} onPress={() => setRevoking(l)} right={<Text style={[T.smallMedium, { color: C.peligro }]}>{t("ui.share.linkRevoke")}</Text>} />
              ))}
          </>
        )}
      </OnlineState>
      <Sheet visible={!!revoking} title={t("office.share.linksRevokeTitle")} onClose={() => setRevoking(null)}>
        <Text style={T.body}>{t("office.share.linksRevokeBody")}</Text>
        {revoke.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{revoke.error}</Text> : null}
        <View style={{ gap: 8, marginTop: 16 }}>
          <Button
            title={t("ui.share.linkRevoke")}
            loading={revoke.pending}
            onPress={async () => {
              if (!revoking) return;
              const r = await revoke.mutate({ id: revoking.id });
              if (r.ok) {
                setRevoking(null);
                showToast(t("ui.toast.shareRevoked"));
              }
            }}
          />
          <Button kind="secondary" title={t("ui.common.cancel")} onPress={() => setRevoking(null)} />
        </View>
      </Sheet>
    </OfficeScreen>
  );
}
