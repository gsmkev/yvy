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
import { Button, EmptyState, Row, SectionHeader, Sheet, Text } from "../../../src/ui/kit";
import { C, T } from "../../../src/ui/theme";

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = getSession()?.organization.role ?? "";
  const allowed = me === "owner" || me === "admin";
  const q = useOnline<Member[]>(allowed ? "/org/members" : null);
  if (!allowed) return <OfficeScreen title={t("ui.teamTitle")}><EmptyState title={t("office.teamNotAllowed")} /></OfficeScreen>;
  const m = q.data?.find((x) => x.userId === id);
  return (
    <OfficeScreen title={m?.fullName ?? t("ui.teamTitle")} subtitle={m ? t(`ui.role_${m.role}` as MessageKey) : undefined} query={q}>
      <OnlineState query={q} isEmpty={() => !m} empty={{ title: t("ui.teamEmpty") }}>
        {() => (m ? <Detail m={m} self={getSession()?.user.id === m.userId} /> : null)}
      </OnlineState>
    </OfficeScreen>
  );
}

function Detail({ m, self }: { m: Member; self: boolean }) {
  const [sheet, setSheet] = useState<null | "link" | "pin" | "plots" | "remove">(null);
  const field = isFieldRoleName(m.role);
  const rows = [
    { label: t("ui.phone"), value: m.phone ?? "—" },
    ...(m.email ? [{ label: t("ui.emailCol"), value: m.email }] : []),
    ...(m.role === "worker" ? [{ label: t("app.teamPinTitle"), value: m.hasPin ? "✓" : t("app.teamPinNone") }] : []),
    { label: t("ui.teamColLastSync"), value: m.lastSyncAt ? `${ageText(Date.now() - m.lastSyncAt)} · ${fmtDateTime(m.lastSyncAt)}` : t("ui.neverVisited") },
  ];
  const stats = [
    { label: t("ui.teamColRecords"), value: fmtNumber(m.records7d, 0) },
    { label: t("ui.teamColPlots"), value: fmtNumber(m.plotsVisited7d, 0) },
    ...(m.overdueTasks > 0 ? [{ label: t("ui.teamColOverdue"), value: fmtNumber(m.overdueTasks, 0), tone: "danger" as const }] : []),
  ].filter((s) => s.value !== "0" || s.tone);
  return (
    <>
      <KeyValue rows={rows} />
      <SectionHeader title={t("office.teamActivityTitle")} />
      {stats.length ? <StatRow items={stats} /> : <Text style={T.small}>{t("ui.neverVisited")}</Text>}
      <SectionHeader title={t("office.teamActionsTitle")} />
      <Row title={t("ui.assignPlots")} onPress={() => setSheet("plots")} />
      {field ? <Row title={t("ui.linkDevice")} onPress={() => setSheet("link")} /> : null}
      {m.role === "worker" ? <Row title={m.hasPin ? t("app.teamPinChange") : t("app.teamPinSet")} onPress={() => setSheet("pin")} /> : null}
      {!self ? <Row title={t("ui.removeMember")} tone="danger" onPress={() => setSheet("remove")} /> : null}
      <LinkSheet m={m} visible={sheet === "link"} onClose={() => setSheet(null)} />
      <PinSheet m={m} visible={sheet === "pin"} onClose={() => setSheet(null)} />
      <PlotsSheet m={m} visible={sheet === "plots"} onClose={() => setSheet(null)} />
      <RemoveSheet m={m} visible={sheet === "remove"} onClose={() => setSheet(null)} />
    </>
  );
}

/** El QR no se dibuja (no hay librería de QR utilizable en la app): se muestra el enlace y se comparte. */
function LinkSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const gen = useOnlineMutation<{ userId: string }, { qr: string; expiresAt: number }>("POST", "/auth/link");
  const [res, setRes] = useState<{ qr: string; expiresAt: number } | null>(null);
  useEffect(() => {
    if (!visible) return setRes(null);
    gen.reset();
    void gen.mutate({ userId: m.userId }).then((r) => r.ok && setRes(r.data));
  }, [visible]);
  return (
    <Sheet visible={visible} title={`${t("office.teamLinkTitle")} · ${m.fullName}`} onClose={onClose}>
      <Text style={T.body}>{t("ui.linkHelp")}</Text>
      {res ? (
        <>
          <Text selectable style={[T.small, { marginTop: 12, padding: 12, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, borderRadius: 8 }]}>{res.qr}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("ui.expires", { date: fmtDateTime(res.expiresAt) })}</Text>
          <Text style={[T.small, { marginTop: 8 }]}>{t("office.teamLinkNoQr")}</Text>
          <Button title={t("office.teamLinkShare")} onPress={() => void Share.share({ message: res.qr })} style={{ marginTop: 16 }} />
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
    if (!phone.trim()) return setErr(t("office.teamPinNeedsPhone"));
    if (pin && !/^\d{6}$/.test(pin)) return setErr(t("office.teamPinBad"));
    setErr(null);
    const r = await save.mutate({ phone: phone.trim(), ...(pin ? { pin } : {}) });
    if (!r.ok) return;
    if (r.data.pin) setShown(r.data.pin);
    else { showToast(t("app.teamPinSaved")); onClose(); }
  };
  if (shown)
    return (
      <Sheet visible={visible} title={t("app.teamPinTitle")} onClose={onClose}>
        <Text style={[T.display, { textAlign: "center", letterSpacing: 6 }]}>{shown}</Text>
        <Text style={[T.body, { marginTop: 12 }]}>{t("app.teamPinShow", { name: m.fullName, pin: shown })}</Text>
        <Button title={t("ui.close")} onPress={onClose} style={{ marginTop: 16 }} />
      </Sheet>
    );
  return (
    <FormSheet visible={visible} title={`${t("app.teamPinTitle")} · ${m.fullName}`} onClose={onClose} onSubmit={submit} submitLabel={t("ui.save")} pending={save.pending} error={err ?? save.error ?? clear.error}>
      <TextField label={t("app.teamPinPhoneLabel")} value={phone} onChangeText={setPhone} maxLength={30} />
      <TextField label={t("app.loginPinLabel")} hint={t("app.teamPinGenerate")} kind="number" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} />
      {m.hasPin ? <Button kind="danger" title={t("app.teamPinRemove")} loading={clear.pending} onPress={() => void clear.mutate().then((r) => r.ok && onClose())} style={{ marginTop: 12 }} /> : null}
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
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : t("office.loadFailed")));
    return () => { live = false; };
  }, [visible]);
  const toggle = (pid: string) => setChosen((c) => { const n = new Set(c ?? []); if (n.has(pid)) n.delete(pid);
    else n.add(pid);
    return n; });
  const submit = async () => {
    const r = await save.mutate({ plotIds: [...(chosen ?? [])] });
    if (r.ok) { showToast(t("ui.toastPlotsAssigned")); onClose(); }
  };
  return (
    <Sheet visible={visible} title={`${t("ui.assignPlots")} · ${m.fullName}`} onClose={onClose}>
      {data.plots.length === 0 ? (
        <EmptyState title={t("office.teamAssignEmpty")} />
      ) : loadError ? (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro }]}>{loadError}</Text>
      ) : !chosen ? (
        <Text style={T.small}>{t("office.needsSignalHint")}</Text>
      ) : (
        <>
          <Text style={T.small}>{t("office.teamAssignHint")}</Text>
          {data.farms.map((f) => (
            <View key={f.id}>
              <SectionHeader title={f.name} />
              {data.plots.filter((p) => p.farmId === f.id).map((p) => (
                <Row key={p.id} choice="checkbox" title={p.name} subtitle={p.areaHa ? `${fmtNumber(p.areaHa)} ha` : undefined} selected={chosen.has(p.id)} onPress={() => toggle(p.id)} />
              ))}
            </View>
          ))}
          {save.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{save.error}</Text> : null}
          <Button title={t("office.teamAssignSave")} loading={save.pending} onPress={() => void submit()} style={{ marginTop: 16 }} />
        </>
      )}
    </Sheet>
  );
}

function RemoveSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const del = useOnlineMutation<void, unknown>("DELETE", `/org/members/${m.userId}`, { invalidate: ["/org/members"] });
  return (
    <Sheet visible={visible} title={t("ui.removeMember")} onClose={onClose}>
      <Text style={T.body}>{t("office.teamRemoveBody", { name: m.fullName })}</Text>
      {del.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{del.error}</Text> : null}
      <Button kind="danger" title={t("ui.removeMember")} loading={del.pending} onPress={() => void del.mutate().then((r) => { if (r.ok) { showToast(t("ui.toastMemberRemoved")); onClose(); router.back(); } })} style={{ marginTop: 16 }} />
      <Button kind="text" title={t("ui.cancel")} onPress={onClose} style={{ marginTop: 4 }} />
    </Sheet>
  );
}
