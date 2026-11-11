import { MapPinned, QrCode, UserPlus } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ROLES } from "@yvy/shared";
import { ExportButtons } from "../components/ExportButtons";
import { Button, ConfirmModal, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../components/ui";
import { del, get, post, put } from "../lib/api";
import { localDate } from "@yvy/shared";
import { fmtDateTime, fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMe, useMembers, useTasks } from "../lib/queries";
import type { FarmDetail, Member } from "../lib/types";

export function TeamPage() {
  const me = useMe();
  const members = useMembers();
  const openTasks = useTasks({ status: "open" });
  const today = localDate(Date.now());
  const overdueOf = (userId: string) =>
    (openTasks.data ?? []).filter((x) => x.assigneeId === userId && x.dueDate < today).length;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<{ member: Member; qr: string; expiresAt: number } | null>(null);
  const [assigning, setAssigning] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";
  const link = useMutation({
    mutationFn: (m: Member) =>
      post<{ qr: string; expiresAt: number }>("/auth/link", { userId: m.userId }).then((r) => ({ member: m, ...r })),
    onSuccess: setQr,
  });
  const remove = useMutation({
    mutationFn: (m: Member) => del(`/org/members/${m.userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast(t("ui.toastMemberRemoved"));
      setRemoving(null);
    },
  });

  if (members.isLoading) return <Spinner />;
  if (members.error) return <ErrorBox error={members.error} />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("ui.teamTitle")}</h1>
        <div className="flex items-center gap-2">
          <ExportButtons
            data={() => ({
              name: t("ui.teamFile"),
              headers: [t("ui.name"), t("ui.role"), t("ui.emailCol"), t("ui.phone")],
              rows: members.data!.map((m) => [m.fullName, tk(`ui.role_${m.role}`), m.email, m.phone]),
            })}
          />
          {canManage && (
            <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>
              {t("ui.addMember")}
            </Button>
          )}
        </div>
      </div>
      {link.error && <ErrorBox error={link.error} />}
      {members.data!.map((m) => (
        <div key={m.userId} className="flex flex-wrap items-center gap-3 border-b border-linea py-4">
          <div className="flex-1">
            <div className="font-semibold">{m.fullName}</div>
            <div className="text-sm text-tinta-2">
              {tk(`ui.role_${m.role}`)} {m.email ? `· ${m.email}` : ""} {m.phone ? `· ${m.phone}` : ""}
            </div>
            <div className="num mt-0.5 text-xs text-tinta-2">
              {t("ui.activityDays", { n: m.activeDays7 })} ·{" "}
              {t(m.records7d === 1 ? "ui.activityRecordsOne" : "ui.activityRecords", { n: m.records7d })} ·{" "}
              {m.lastSyncAt ? t("ui.lastSync", { date: fmtDateTime(m.lastSyncAt) }) : t("ui.neverSynced")}
            </div>
            {overdueOf(m.userId) > 0 && (
              <div className="num mt-0.5 text-sm font-medium text-peligro">
                {t(overdueOf(m.userId) === 1 ? "ui.overdueCountOne" : "ui.overdueCountMany", {
                  n: overdueOf(m.userId),
                })}
              </div>
            )}
          </div>
          <Button icon={MapPinned} onClick={() => setAssigning(m)}>
            {t("ui.assignPlots")}
          </Button>
          {canManage && m.role === "worker" && (
            <Button icon={QrCode} onClick={() => link.mutate(m)}>
              {t("ui.linkDevice")}
            </Button>
          )}
          {canManage && m.userId !== me.data?.user.id && (
            <Button variant="danger" onClick={() => setRemoving(m)}>
              {t("ui.removeMember")}
            </Button>
          )}
        </div>
      ))}
      {removing && (
        <ConfirmModal
          title={removing.fullName}
          message={t("ui.confirmDelete", { name: removing.fullName })}
          confirmLabel={t("ui.removeMember")}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {adding && <AddMember canAddAdmins={me.data?.role === "owner"} onClose={() => setAdding(false)} />}
      {assigning && <AssignPlots member={assigning} onClose={() => setAssigning(null)} />}
      {qr && (
        <Modal title={`${t("ui.linkDevice")} · ${qr.member.fullName}`} onClose={() => setQr(null)}>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-linea bg-papel p-4">
              <QRCodeSVG value={qr.qr} size={240} />
            </div>
            <p className="text-center text-sm text-tinta-2">{t("ui.linkHelp")}</p>
            <p className="num text-xs text-tinta-2">{t("ui.expires", { date: fmtDateTime(qr.expiresAt) })}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddMember({ canAddAdmins, onClose }: { canAddAdmins: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fullName: "", email: "", phone: "", role: "worker" });
  const add = useMutation({
    mutationFn: () =>
      post("/org/members", { fullName: f.fullName, email: f.email || null, phone: f.phone || null, role: f.role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast(t("ui.toastMemberAdded"));
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const roles = ROLES.filter((r) => canAddAdmins || r === "worker");
  return (
    <Modal title={t("ui.addMember")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label={t("ui.fullName")}>
          <Input required value={f.fullName} onChange={set("fullName")} />
        </Field>
        <Field label={t("ui.role")}>
          <Select
            value={f.role}
            onChange={set("role")}
            options={roles.map((r) => ({ value: r, label: tk(`ui.role_${r}`) }))}
          />
        </Field>
        <Field label={t("auth.emailLabel")}>
          <Input type="email" required={f.role !== "worker"} value={f.email} onChange={set("email")} />
        </Field>
        <Field label={t("ui.phone")}>
          <Input type="tel" value={f.phone} onChange={set("phone")} />
        </Field>
        {add.error && <ErrorBox error={add.error} />}
        <Button type="submit" disabled={add.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}

function AssignPlots({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const details = useQueries({
    queries: (farms.data ?? []).map((f) => ({
      queryKey: ["farm", f.id],
      queryFn: () => get<FarmDetail>(`/org/farms/${f.id}`),
    })),
  });
  const loaded = details.every((d) => d.data);
  const initial = new Set(
    details.flatMap((d) => d.data?.assignments.filter((a) => a.userId === member.userId).map((a) => a.plotId) ?? []),
  );
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const current = chosen ?? initial;
  const save = useMutation({
    mutationFn: () => put(`/org/members/${member.userId}/plots`, { plotIds: [...current] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm"] });
      qc.invalidateQueries({ queryKey: ["farms"] });
      toast(t("ui.toastPlotsAssigned"));
      onClose();
    },
  });
  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };
  return (
    <Modal title={`${t("ui.assignPlots")} · ${member.fullName}`} onClose={onClose}>
      {!loaded ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          {details.map(({ data }) => (
            <div key={data!.farm.id}>
              <h3 className="mb-1 text-sm font-semibold">{data!.farm.name}</h3>
              <ul className="grid grid-cols-2 gap-1">
                {data!.plots.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-linea bg-papel p-2 text-sm hover:border-tinta-2/40">
                      <input type="checkbox" checked={current.has(p.id)} onChange={() => toggle(p.id)} />
                      <span className="flex-1">{p.name}</span>
                      <span className="num text-xs text-tinta-2">{fmtHa(p.areaHa)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {save.error && <ErrorBox error={save.error} />}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
