import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { isFieldRole, ROLES, type FarmAccessLevel } from "@yvy/shared";
import { TableExportMenu } from "../components/TableExportMenu";
import { ActionMenu } from "../components/menus";
import { Button, ConfirmModal, EmptyState, ErrorBox, Field, FormActions, Input, Modal, PageHeader, Select, Spinner, toast } from "../components/ui";
import { del, get, post, put } from "../lib/api";
import { fmtDateTime, fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMe, useMembers } from "../lib/queries";
import type { FarmDetail, Member } from "../lib/types";

export function TeamPage() {
  const me = useMe();
  const navigate = useNavigate();
  const members = useMembers();
  const farms = useFarms();
  const access = useQuery({
    enabled: me.data?.role === "owner",
    queryKey: ["farm-access"],
    queryFn: () => get<{ userId: string; farmId: string; level: FarmAccessLevel }[]>("/org/farm-access"),
  });
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<{ member: Member; qr: string; expiresAt: number } | null>(null);
  const [assigning, setAssigning] = useState<Member | null>(null);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [scoping, setScoping] = useState<Member | null>(null);
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

  if (members.isLoading) return <Spinner rows={5} h={64} />;
  if (members.error) return <ErrorBox error={members.error} />;
  const owner = me.data?.role === "owner";
  const scoped = (m: Member) => m.role === "supervisor" || m.role === "admin" || m.role === "agronomist";
  // Estancias que ve cada persona con acceso por estancia: solo el dueño las administra
  const farmsOf = (m: Member) => {
    if (!scoped(m)) return "";
    const mine = (access.data ?? []).filter((a) => a.userId === m.userId).map((a) => farms.data?.find((f) => f.id === a.farmId)?.name);
    if (mine.length === 0) return t(m.role === "supervisor" ? "ui.teamFarmsNone" : "ui.teamFarmsAll");
    return mine.filter(Boolean).join(", ");
  };
  const activity = (m: Member) => {
    const parts = [
      m.activeDays7 > 0 ? t("ui.activityDays", { n: m.activeDays7 }) : "",
      m.records7d > 0 ? t(m.records7d === 1 ? "ui.activityRecordsOne" : "ui.activityRecords", { n: m.records7d }) : "",
      m.plotsVisited7d > 0 ? t(m.plotsVisited7d === 1 ? "ui.activityPlotsOne" : "ui.activityPlots", { n: m.plotsVisited7d }) : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : t("ui.teamNoActivity");
  };
  const cols = owner ? "md:grid-cols-[minmax(0,2fr)_10rem_minmax(0,1fr)_minmax(0,1.6fr)_2.5rem]" : "md:grid-cols-[minmax(0,2fr)_10rem_minmax(0,1.6fr)_2.5rem]";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        className="max-sm:flex-wrap"
        title={t("ui.teamTitle")}
        primary={
          canManage ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t("ui.addMember")}
            </Button>
          ) : undefined
        }
        menu={
          <>
            <TableExportMenu
              data={() => ({
                name: t("ui.teamFile"),
                headers: [t("ui.name"), t("ui.role"), t("ui.emailCol"), t("ui.phone")],
                rows: members.data!.map((m) => [m.fullName, tk(`ui.role_${m.role}`), m.email, m.phone]),
              })}
            />
            <ActionMenu
              label={t("ui.moreActions")}
              items={[
                owner && { label: t("ui.auditTitle"), onSelect: () => void navigate({ to: "/cambios" }) },
                owner && { label: t("ui.apiTokensTitle"), onSelect: () => void navigate({ to: "/api-publica" }) },
                canManage && { label: t("ui.formsLink"), onSelect: () => void navigate({ to: "/formularios" }) },
              ]}
            />
          </>
        }
      />
      {link.error && <ErrorBox error={link.error} />}
      {members.data!.length === 0 ? (
        <EmptyState
          title={t("ui.teamEmpty")}
          action={canManage ? <Button onClick={() => setAdding(true)}>{t("ui.addMember")}</Button> : undefined}
        />
      ) : (
        <div>
          <div className={`hidden gap-4 border-b border-linea pb-2 text-xs text-tinta-2 md:grid ${cols}`}>
            <span>{t("ui.name")}</span>
            <span>{t("ui.role")}</span>
            {owner && <span>{t("ui.farmAccess")}</span>}
            <span>{t("ui.teamColActivity")}</span>
            <span />
          </div>
          <ul>
            {members.data!.map((m) => (
              <li key={m.userId} className={`grid items-start gap-x-4 gap-y-1 border-b border-linea py-3 md:items-center ${cols} grid-cols-[minmax(0,1fr)_2.5rem]`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.fullName}</div>
                  <div className="truncate text-sm text-tinta-2">{[m.email, m.phone].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="col-start-1 row-start-2 text-sm md:col-start-auto md:row-start-auto">
                  {tk(`ui.role_${m.role}`)}
                  {m.role === "worker" && canManage && !m.hasPin && <span className="text-tinta-2"> · {t("app.teamPinNone")}</span>}
                </div>
                {owner && <div className="hidden min-w-0 truncate text-sm text-tinta-2 md:block">{farmsOf(m)}</div>}
                <div className="col-start-1 row-start-3 min-w-0 text-sm md:col-start-auto md:row-start-auto">
                  <div className="num text-tinta-2">{activity(m)}</div>
                  <div className="num text-xs text-tinta-2">{m.lastSyncAt ? t("ui.lastSync", { date: fmtDateTime(m.lastSyncAt) }) : t("ui.neverSynced")}</div>
                  {m.overdueTasks > 0 && (
                    <div className="num text-sm font-medium text-peligro">
                      {t(m.overdueTasks === 1 ? "ui.overdueCountOne" : "ui.overdueCountMany", { n: m.overdueTasks })}
                    </div>
                  )}
                </div>
                <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
                  <ActionMenu
                    label={t("ui.rowActions", { name: m.fullName })}
                    items={[
                      { label: t("ui.assignPlots"), onSelect: () => setAssigning(m) },
                      owner && scoped(m) && { label: t("ui.farmAccess"), onSelect: () => setScoping(m) },
                      canManage && isFieldRole(m.role) && { label: t("ui.linkDevice"), onSelect: () => link.mutate(m) },
                      canManage && m.role === "worker" && { label: m.hasPin ? t("app.teamPinChange") : t("app.teamPinSet"), onSelect: () => setPinFor(m) },
                      canManage && m.userId !== me.data?.user.id && { label: t("ui.removeMember"), onSelect: () => setRemoving(m), danger: true },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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
      {scoping && <FarmAccess member={scoping} onClose={() => setScoping(null)} />}
      {adding && <AddMember canAddAdmins={me.data?.role === "owner"} onClose={() => setAdding(false)} />}
      {assigning && <AssignPlots member={assigning} onClose={() => setAssigning(null)} />}
      {pinFor && <PinDialog member={pinFor} onClose={() => setPinFor(null)} />}
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
  const roles = ROLES.filter((r) => r !== "owner" && (canAddAdmins || isFieldRole(r)));
  return (
    <Modal title={t("ui.addMember")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label={t("ui.memberName")}>
          <Input required value={f.fullName} onChange={set("fullName")} />
        </Field>
        <Field label={t("ui.role")}>
          <Select
            value={f.role}
            onChange={set("role")}
            options={roles.map((r) => ({ value: r, label: tk(`ui.role_${r}`) }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ui.memberEmail")}>
            <Input type="email" required={!isFieldRole(f.role)} value={f.email} onChange={set("email")} />
          </Field>
          <Field label={t("ui.phone")}>
            <Input type="tel" value={f.phone} onChange={set("phone")} />
          </Field>
        </div>
        {add.error && <ErrorBox error={add.error} />}
        <FormActions onCancel={onClose} disabled={add.isPending} />
      </form>
    </Modal>
  );
}

/** F-24: el dueño o administrador da o cambia el PIN de ingreso de un empleado (alternativa al QR). */
function PinDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(member.phone ?? "");
  const [own, setOwn] = useState(false);
  const [pin, setPin] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => put<{ pin?: string }>(`/org/members/${member.userId}/pin`, { phone, ...(own ? { pin } : {}) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      if (r.pin) setShown(r.pin);
      else {
        toast(t("app.teamPinSaved"));
        onClose();
      }
    },
  });
  const clear = useMutation({
    mutationFn: () => del(`/org/members/${member.userId}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      onClose();
    },
  });
  return (
    <Modal title={`${t("app.teamPinTitle")} · ${member.fullName}`} onClose={onClose}>
      {shown ? (
        <div className="flex flex-col gap-4">
          <p className="num text-center text-4xl font-semibold tracking-[0.3em]">{shown}</p>
          <p className="text-sm text-tinta-2">{t("app.teamPinShow", { name: member.fullName, pin: shown })}</p>
          <Button variant="primary" onClick={onClose}>
            {t("ui.close")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label={t("app.teamPinPhoneLabel")}>
            <Input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
            {t("app.teamPinOwn")}
          </label>
          {own && (
            <Field label={t("app.loginPinLabel")}>
              <Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
          )}
          {!own && <p className="text-sm text-tinta-2">{t("app.teamPinGenerate")}</p>}
          {(save.error || clear.error) && <ErrorBox error={save.error ?? clear.error} />}
          <FormActions
            onCancel={onClose}
            disabled={save.isPending || (own && pin.length !== 6)}
            extra={
              member.hasPin && (
                <Button variant="danger" disabled={clear.isPending} onClick={() => clear.mutate()}>
                  {t("app.teamPinRemove")}
                </Button>
              )
            }
          />
        </form>
      )}
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

/** T-09 / K-05: estancias de un supervisor, administrador o agrónomo (solo el dueño). Sin ninguna marcada: supervisor no ve nada; el resto ve todas. */
function FarmAccess({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const access = useQuery({
    queryKey: ["farm-access"],
    queryFn: () => get<{ userId: string; farmId: string; level: FarmAccessLevel }[]>("/org/farm-access"),
  });
  const [chosen, setChosen] = useState<Map<string, FarmAccessLevel> | null>(null);
  const initial = new Map((access.data ?? []).filter((a) => a.userId === member.userId).map((a) => [a.farmId, a.level]));
  const current = chosen ?? initial;
  const save = useMutation({
    mutationFn: () =>
      put(`/org/members/${member.userId}/farms`, { farms: [...current].map(([farmId, level]) => ({ farmId, level })) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm-access"] });
      toast(t("ui.farmAccessSaved"));
      onClose();
    },
  });
  const set = (id: string, level: FarmAccessLevel | null) => {
    const next = new Map(current);
    if (level) next.set(id, level);
    else next.delete(id);
    setChosen(next);
  };
  return (
    <Modal title={`${t("ui.farmAccess")} · ${member.fullName}`} onClose={onClose}>
      {!farms.data || !access.data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tinta-2">
            {member.role === "supervisor" ? t("ui.farmAccessHintSupervisor") : t("ui.farmAccessHintOther")}
          </p>
          <ul className="flex flex-col gap-1">
            {farms.data.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border border-linea bg-papel p-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={f.name}
                  checked={current.has(f.id)}
                  onChange={(e) => set(f.id, e.target.checked ? "edit" : null)}
                />
                <span className="flex-1">{f.name}</span>
                {current.has(f.id) && (
                  <Select
                    value={current.get(f.id)!}
                    onChange={(e) => set(f.id, e.target.value as FarmAccessLevel)}
                    options={(["edit", "view"] as const).map((l) => ({ value: l, label: tk(`ui.farmAccess_${l}`) }))}
                  />
                )}
              </li>
            ))}
          </ul>
          {save.error && <ErrorBox error={save.error} />}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t("ui.save")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
