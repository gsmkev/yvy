/** Ficha de una persona (104): datos, actividad, vincular celular con QR/enlace (105), PIN, lotes asignados (106) y baja. */
import { useEffect, useState } from "react";
import { Share, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { t, type MessageKey } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { api, getSession } from "../../../src/lib/session";
import { showToast } from "../../../src/lib/toast";
import { useLocal } from "../../../src/lib/useLocal";
import { ageText, fmtDateTime, fmtNumber } from "../../../src/office/format";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { isFieldRoleName, type Member } from "../../../src/office/team";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { FormSheet, KeyValue, StatRow, TextField } from "../../../src/office/ui";
import { FarmAccessSheet, isScopedRole } from "../../../src/office/FarmAccessSheet";
import { QrCode } from "../../../src/ui/QrCode";
import { Button, EmptyState, Row, SectionHeader, Sheet, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = getSession()?.organization.role ?? "";
  const allowed = ["owner", "admin", "agronomist", "supervisor"].includes(me);
  const q = useOnline<Member[]>(allowed ? "/org/members" : null);
  if (!allowed) return <OfficeScreen title={t("ui.team.title")}><EmptyState title={t("office.team.notAllowed")} /></OfficeScreen>;
  const m = q.data?.find((x) => x.userId === id);
  return (
    <OfficeScreen title={m?.fullName ?? t("ui.team.title")} subtitle={m ? t(`ui.role.${m.role}` as MessageKey) : undefined} query={q}>
      <OnlineState query={q} isEmpty={() => !m} empty={{ title: t("ui.team.empty") }}>
        {() => (m ? <Detail m={m} self={getSession()?.user.id === m.userId} manage={me === "owner" || me === "admin"} /> : null)}
      </OnlineState>
    </OfficeScreen>
  );
}

function Detail({ m, self, manage }: { m: Member; self: boolean; manage: boolean }) {
  const [sheet, setSheet] = useState<null | "link" | "pin" | "plots" | "remove" | "farms">(null);
  const field = isFieldRoleName(m.role);
  const rows = [
    { label: t("ui.common.phone"), value: m.phone ?? "—" },
    ...(m.email ? [{ label: t("ui.common.emailCol"), value: m.email }] : []),
    ...(m.role === "worker" ? [{ label: t("app.team.pinTitle"), value: m.hasPin ? "✓" : t("app.team.pinNone") }] : []),
    { label: t("ui.team.colLastSync"), value: m.lastSyncAt ? `${ageText(Date.now() - m.lastSyncAt)} · ${fmtDateTime(m.lastSyncAt)}` : t("ui.never.visited") },
  ];
  const stats = [
    { label: t("ui.team.colRecords"), value: fmtNumber(m.records7d, 0) },
    { label: t("ui.team.colPlots"), value: fmtNumber(m.plotsVisited7d, 0) },
    ...(m.overdueTasks > 0 ? [{ label: t("ui.team.colOverdue"), value: fmtNumber(m.overdueTasks, 0), tone: "danger" as const }] : []),
  ].filter((s) => s.value !== "0" || s.tone);
  return (
    <>
      <KeyValue rows={rows} />
      <SectionHeader title={t("office.team.activityTitle")} />
      {stats.length ? <StatRow items={stats} /> : <Text style={T.small}>{t("ui.never.visited")}</Text>}
      <SectionHeader title={t("office.team.actionsTitle")} />
      <Row title={t("ui.common.assignPlots")} onPress={() => setSheet("plots")} />
      {getSession()?.organization.role === "owner" && isScopedRole(m.role) ? <Row title={t("office.team.farmsTitle")} onPress={() => setSheet("farms")} /> : null}
      {manage && field ? <Row title={t("ui.link.device")} onPress={() => setSheet("link")} /> : null}
      {manage && m.role === "worker" ? <Row title={m.hasPin ? t("app.team.pinChange") : t("app.team.pinSet")} onPress={() => setSheet("pin")} /> : null}
      {manage && !self ? <Row title={t("ui.common.removeMember")} tone="danger" onPress={() => setSheet("remove")} /> : null}
      <LinkSheet m={m} visible={sheet === "link"} onClose={() => setSheet(null)} />
      <PinSheet m={m} visible={sheet === "pin"} onClose={() => setSheet(null)} />
      <PlotsSheet m={m} visible={sheet === "plots"} onClose={() => setSheet(null)} />
      <FarmAccessSheet m={m} visible={sheet === "farms"} onClose={() => setSheet(null)} />
      <RemoveSheet m={m} visible={sheet === "remove"} onClose={() => setSheet(null)} />
    </>
  );
}

/** QR con el enlace yvy://link?c=… (lo lee app/scan.tsx en el otro teléfono); debajo, el enlace y Compartir como alternativa. */
function LinkSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const gen = useOnlineMutation<{ userId: string }, { qr: string; expiresAt: number }>("POST", "/auth/link");
  const [res, setRes] = useState<{ qr: string; expiresAt: number } | null>(null);
  useEffect(() => {
    if (!visible) return setRes(null);
    gen.reset();
    void gen.mutate({ userId: m.userId }).then((r) => r.ok && setRes(r.data));
  }, [visible]);
  return (
    <Sheet visible={visible} title={`${t("office.team.linkTitle")} · ${m.fullName}`} onClose={onClose}>
      <Text style={T.body}>{t("ui.link.help")}</Text>
      {res ? (
        <>
          <View style={{ marginTop: 12 }}><QrCode value={res.qr} size={240} label={t("office.team.linkQrLabel", { name: m.fullName })} /></View>
          <Text style={[T.small, { marginTop: 8, textAlign: "center" }]}>{t("ui.common.expires", { date: fmtDateTime(res.expiresAt) })}</Text>
          <Text selectable style={[T.small, { marginTop: 12, padding: 12, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, borderRadius: 8 }]}>{res.qr}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("office.team.linkNoQr")}</Text>
          <Button kind="secondary" title={t("office.team.linkShare")} onPress={() => void Share.share({ message: res.qr })} style={{ marginTop: 16 }} />
        </>
      ) : gen.error ? (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{gen.error}</Text>
      ) : null}
    </Sheet>
  );
}

function PinSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState(m.phone ?? "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const save = useOnlineMutation<{ phone: string; pin?: string }, { pin?: string }>("PUT", `/org/members/${m.userId}/pin`, { invalidate: ["/org/members"] });
  const clear = useOnlineMutation<void, unknown>("DELETE", `/org/members/${m.userId}/pin`, { invalidate: ["/org/members"] });
  useEffect(() => { if (visible) { setShown(null); setPin(""); setErr(null); save.reset(); } }, [visible]);
  const submit = async () => {
    if (!phone.trim()) return setErr(t("office.team.pinNeedsPhone"));
    if (pin && !/^\d{6}$/.test(pin)) return setErr(t("office.team.pinBad"));
    setErr(null);
    const r = await save.mutate({ phone: phone.trim(), ...(pin ? { pin } : {}) });
    if (!r.ok) return;
    if (r.data.pin) setShown(r.data.pin);
    else { showToast(t("app.team.pinSaved")); onClose(); }
  };
  if (shown)
    return (
      <Sheet visible={visible} title={t("app.team.pinTitle")} onClose={onClose}>
        <Text style={[T.display, { textAlign: "center", letterSpacing: 6 }]}>{shown}</Text>
        <Text style={[T.body, { marginTop: 12 }]}>{t("app.team.pinShow", { name: m.fullName, pin: shown })}</Text>
        <Button title={t("ui.common.close")} onPress={onClose} style={{ marginTop: 16 }} />
      </Sheet>
    );
  return (
    <FormSheet visible={visible} title={`${t("app.team.pinTitle")} · ${m.fullName}`} onClose={onClose} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={err ?? save.error ?? clear.error}>
      <TextField label={t("app.team.pinPhoneLabel")} value={phone} onChangeText={setPhone} maxLength={30} />
      <TextField label={t("app.login.pinLabel")} hint={t("app.team.pinGenerate")} kind="number" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} />
      {m.hasPin ? <Button kind="danger" title={t("app.team.pinRemove")} loading={clear.pending} onPress={() => void clear.mutate().then((r) => r.ok && onClose())} style={{ marginTop: 12 }} /> : null}
    </FormSheet>
  );
}

interface FarmDetail { assignments: { plotId: string; userId: string }[] }

/** Lotes por estancia con casillas. Lo asignado de hoy viene de GET /org/farms/:id; guarda con PUT /org/members/:id/plots. */
function PlotsSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const data = useLocal(() => ({ farms: getDb().farms(), plots: getDb().plots() }));
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const save = useOnlineMutation<{ plotIds: string[] }, unknown>("PUT", `/org/members/${m.userId}/plots`);
  useEffect(() => {
    if (!visible) return;
    setChosen(null);
    setLoadError(null);
    save.reset();
    let live = true;
    Promise.all(data.farms.map((f) => api<FarmDetail>("GET", `/org/farms/${f.id}`)))
      .then((ds) => live && setChosen(new Set(ds.flatMap((d) => d.assignments.filter((a) => a.userId === m.userId).map((a) => a.plotId)))))
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : t("office.common.loadFailed")));
    return () => { live = false; };
  }, [visible]);
  const toggle = (pid: string) => setChosen((c) => { const n = new Set(c ?? []); if (n.has(pid)) n.delete(pid);
    else n.add(pid);
    return n; });
  const submit = async () => {
    const r = await save.mutate({ plotIds: [...(chosen ?? [])] });
    if (r.ok) { showToast(t("ui.toast.plotsAssigned")); onClose(); }
  };
  return (
    <Sheet visible={visible} title={`${t("ui.common.assignPlots")} · ${m.fullName}`} onClose={onClose}>
      {data.plots.length === 0 ? (
        <EmptyState title={t("office.team.assignEmpty")} />
      ) : loadError ? (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro }]}>{loadError}</Text>
      ) : !chosen ? (
        <Text style={T.small}>{t("office.needs.signalHint")}</Text>
      ) : (
        <>
          <Text style={T.small}>{t("office.team.assignHint")}</Text>
          {data.farms.map((f) => (
            <View key={f.id}>
              <SectionHeader title={f.name} />
              {data.plots.filter((p) => p.farmId === f.id).map((p) => (
                <Row key={p.id} choice="checkbox" title={p.name} subtitle={p.areaHa ? `${fmtNumber(p.areaHa)} ha` : undefined} selected={chosen.has(p.id)} onPress={() => toggle(p.id)} />
              ))}
            </View>
          ))}
          {save.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{save.error}</Text> : null}
          <Button title={t("office.team.assignSave")} loading={save.pending} onPress={() => void submit()} style={{ marginTop: 16 }} />
        </>
      )}
    </Sheet>
  );
}

function RemoveSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const del = useOnlineMutation<void, unknown>("DELETE", `/org/members/${m.userId}`, { invalidate: ["/org/members"] });
  return (
    <Sheet visible={visible} title={t("ui.common.removeMember")} onClose={onClose}>
      <Text style={T.body}>{t("office.team.removeBody", { name: m.fullName })}</Text>
      {del.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{del.error}</Text> : null}
      <Button kind="danger" title={t("ui.common.removeMember")} loading={del.pending} onPress={() => void del.mutate().then((r) => { if (r.ok) { showToast(t("ui.toast.memberRemoved")); onClose(); router.back(); } })} style={{ marginTop: 16 }} />
      <Button kind="text" title={t("ui.common.cancel")} onPress={onClose} style={{ marginTop: 4 }} />
    </Sheet>
  );
}
