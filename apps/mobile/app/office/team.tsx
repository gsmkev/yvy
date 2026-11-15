/** Equipo (función 104) y alta de personas (105). GET /org/members, POST /org/members, PUT /org/members/:id/pin. Solo dueño y administrador. */
import { useState } from "react";
import { router } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { t, type MessageKey } from "@yvy/shared";
import { getSession } from "../../src/lib/session";
import { showToast } from "../../src/lib/toast";
import { ageText } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { isFieldRoleName, type Member } from "../../src/office/team";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { DataList, FormSheet, SelectField, TextField } from "../../src/office/ui";
import { EmptyState } from "../../src/ui/kit";
import { C, F } from "../../src/ui/theme";
import { Text } from "react-native";

const role = (r: string) => t(`ui.role_${r}` as MessageKey);

export default function Team() {
  const me = getSession()?.organization.role ?? "";
  const allowed = me === "owner" || me === "admin";
  const q = useOnline<Member[]>(allowed ? "/org/members" : null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: "", role: "worker", phone: "", pin: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const add = useOnlineMutation<{ fullName: string; role: string; phone: string | null; email: null }, { userId: string }>("POST", "/org/members", { invalidate: ["/org/members"] });
  const setPin = useOnlineMutation<{ userId: string; phone: string; pin: string }, unknown>("PUT", (b) => `/org/members/${b.userId}/pin`, { invalidate: ["/org/members"] });

  if (!allowed) return <OfficeScreen title={t("ui.teamTitle")}><EmptyState title={t("office.teamNotAllowed")} /></OfficeScreen>;

  const submit = async () => {
    const name = f.fullName.trim();
    if (name.length < 2) return setFormError(t("office.teamNameRequired"));
    if (f.pin && !/^\d{6}$/.test(f.pin)) return setFormError(t("office.teamPinBad"));
    if (f.pin && !f.phone.trim()) return setFormError(t("office.teamPinNeedsPhone"));
    setFormError(null);
    const r = await add.mutate({ fullName: name, role: f.role, phone: f.phone.trim() || null, email: null });
    if (!r.ok) return;
    if (f.pin) {
      const p = await setPin.mutate({ userId: r.data.userId, phone: f.phone.trim(), pin: f.pin });
      if (!p.ok) return setFormError(p.error);
    }
    setOpen(false);
    setF({ fullName: "", role: "worker", phone: "", pin: "" });
    showToast(t("ui.toastMemberAdded"));
    router.push({ pathname: "/office/member/[id]", params: { id: r.data.userId } });
  };

  return (
    <OfficeScreen title={t("ui.teamTitle")} query={q} action={{ label: t("office.teamAddTitle"), icon: UserPlus, onPress: () => { add.reset(); setFormError(null); setOpen(true); } }}>
      <OnlineState query={q} empty={{ title: t("ui.teamEmpty") }}>
        {(rows) => (
          <DataList
            rows={rows}
            keyOf={(m) => m.userId}
            title={(m) => m.fullName}
            subtitle={(m) =>
              [
                role(m.role),
                m.role === "worker" && !m.hasPin ? t("app.teamPinNone") : null,
                m.records7d > 0 ? t("office.teamRecords7", { n: m.records7d }) : null,
                m.lastSyncAt ? t("office.teamLastSeen", { when: ageText(Date.now() - m.lastSyncAt) }) : null,
              ].filter(Boolean).join(" · ")
            }
            right={(m) => (m.overdueTasks > 0 ? <Text style={{ fontFamily: F.sansSemi, fontSize: 15, color: C.peligro }}>{t("office.teamOverdueN", { n: m.overdueTasks })}</Text> : undefined) as never}
            onPress={(m) => router.push({ pathname: "/office/member/[id]", params: { id: m.userId } })}
            empty={{ title: t("ui.teamEmpty") }}
          />
        )}
      </OnlineState>
      <FormSheet visible={open} title={t("office.teamAddTitle")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.save")} pending={add.pending || setPin.pending} error={formError ?? add.error}>
        <TextField label={t("ui.memberName")} value={f.fullName} onChangeText={(v) => setF({ ...f, fullName: v })} maxLength={120} />
        <SelectField label={t("ui.role")} value={f.role} options={["worker", "contractor"].map((r) => ({ value: r, label: role(r) }))} onChange={(v) => setF({ ...f, role: v })} />
        <TextField label={t("ui.phone")} hint={t("office.teamAddPhoneHint")} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} maxLength={30} />
        {isFieldRoleName(f.role) ? <TextField label={t("app.loginPinLabel")} hint={t("office.teamPinHint")} kind="number" value={f.pin} onChangeText={(v) => setF({ ...f, pin: v.replace(/\D/g, "").slice(0, 6) })} /> : null}
      </FormSheet>
    </OfficeScreen>
  );
}
