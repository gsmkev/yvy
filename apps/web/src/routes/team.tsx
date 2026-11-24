/** Equipo de la organización: miembros, roles, accesos, PIN y baja. */
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { isFieldRole, type FarmAccessLevel } from "@yvy/shared";
import { TableExportMenu } from "../components/TableExportMenu";
import { ActionMenu } from "../components/menus";
import { Button, type Column, ConfirmModal, DataTable, EmptyState, ErrorBox, Modal, Page, PageHeader, Spinner, toast } from "../components/ui";
import { del, get, post } from "../lib/api";
import { fmtDate, fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useFarms, useMe, useMembers } from "../lib/queries";
import type { Member } from "../lib/types";
import { AddMember } from "./team/AddMember";
import { PinDialog } from "./team/PinDialog";
import { AssignPlots } from "./team/AssignPlots";
import { FarmAccess } from "./team/FarmAccess";

/** Lista de miembros con alta, cambio de acceso y baja. */
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
      toast(t("ui.toast.memberRemoved"));
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
    if (mine.length === 0) return t(m.role === "supervisor" ? "ui.team.farmsNone" : "ui.team.farmsAll");
    return mine.filter(Boolean).join(", ");
  };
  const since = (ms: number) => {
    const h = Math.floor((Date.now() - ms) / 3_600_000);
    if (h < 1) return t("ui.team.justNow");
    if (h < 24) return t("ui.team.hoursAgo", { n: h });
    const d = Math.floor(h / 24);
    return d === 1 ? t("app.common.yesterday") : d < 30 ? t("ui.team.daysAgo", { n: d }) : fmtDate(ms);
  };
  const columns: Column<Member>[] = [
    {
      id: "person",
      header: t("ui.common.name"),
      cell: (m) => (
        <div className="min-w-0 max-w-[8rem] py-1 sm:max-w-none">
          <div className="truncate font-medium">{m.fullName}</div>
          <div className="truncate text-xs font-normal text-tinta-2">{[m.email, m.phone].filter(Boolean).join(" · ")}</div>
          <div className="truncate text-xs sm:hidden">
            {tk(`ui.role.${m.role}`)}
            {m.role === "worker" && canManage && !m.hasPin && <span className="text-trigo-texto"> · {t("app.team.pinNone")}</span>}
          </div>
          {m.overdueTasks > 0 && (
            <div className="num text-xs font-medium text-peligro sm:hidden">
              {t(m.overdueTasks === 1 ? "ui.overdue.countOne" : "ui.overdue.countMany", { n: m.overdueTasks })}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "role",
      header: t("ui.common.role"),
      hideBelow: "sm",
      cell: (m) => (
        <div className="whitespace-nowrap">
          {tk(`ui.role.${m.role}`)}
          {m.role === "worker" && canManage && !m.hasPin && <div className="text-xs text-trigo-texto">{t("app.team.pinNone")}</div>}
        </div>
      ),
    },
    ...(owner
      ? [
          {
            id: "farms",
            header: t("ui.farm.access"),
            hideBelow: "lg" as const,
            cell: (m: Member) => <span className="line-clamp-2 text-tinta-2">{farmsOf(m) || "—"}</span>,
          },
        ]
      : []),
    { id: "records", header: t("ui.team.colRecords"), align: "right", cell: (m) => m.records7d, sort: (a, b) => a.records7d - b.records7d },
    { id: "plots", header: t("ui.team.colPlots"), align: "right", hideBelow: "md", cell: (m) => m.plotsVisited7d },
    {
      id: "last",
      header: t("ui.team.colLastSync"),
      hideBelow: "md",
      cell: (m) => (
        <span className="whitespace-nowrap text-tinta-2" title={m.lastSyncAt ? fmtDateTime(m.lastSyncAt) : undefined}>
          {m.lastSyncAt ? since(m.lastSyncAt) : t("ui.never.visited")}
        </span>
      ),
    },
    {
      id: "overdue",
      header: t("ui.team.colOverdue"),
      align: "right",
      hideBelow: "sm",
      cell: (m) => (m.overdueTasks > 0 ? <span className="font-medium text-peligro">{m.overdueTasks}</span> : <span className="text-tinta-2">0</span>),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      width: "3rem",
      cell: (m) => (
        <div className="flex justify-end">
          <ActionMenu
            label={t("ui.row.actions", { name: m.fullName })}
            items={[
              { label: t("ui.common.assignPlots"), onSelect: () => setAssigning(m) },
              owner && scoped(m) && { label: t("ui.farm.access"), onSelect: () => setScoping(m) },
              canManage && isFieldRole(m.role) && { label: t("ui.link.device"), onSelect: () => link.mutate(m) },
              canManage && m.role === "worker" && { label: m.hasPin ? t("app.team.pinChange") : t("app.team.pinSet"), onSelect: () => setPinFor(m) },
              canManage && m.userId !== me.data?.user.id && { label: t("ui.common.removeMember"), onSelect: () => setRemoving(m), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];
  return (
    <Page width="data">
      <PageHeader
        className="max-sm:flex-wrap"
        title={t("ui.team.title")}
        primary={
          canManage ? (
            <Button variant="primary" className="max-sm:hidden" onClick={() => setAdding(true)}>
              {t("ui.add.member")}
            </Button>
          ) : undefined
        }
        menu={
          <>
            <TableExportMenu
              data={() => ({
                name: t("ui.team.file"),
                headers: [t("ui.common.name"), t("ui.common.role"), t("ui.common.emailCol"), t("ui.common.phone")],
                rows: members.data!.map((m) => [m.fullName, tk(`ui.role.${m.role}`), m.email, m.phone]),
              })}
            />
            <ActionMenu
              label={t("ui.common.moreActions")}
              items={[
                owner && { label: t("ui.audit.title"), onSelect: () => void navigate({ to: "/cambios" }) },
                owner && { label: t("ui.api.tokensTitle"), onSelect: () => void navigate({ to: "/api-publica" }) },
                canManage && { label: t("ui.forms.link"), onSelect: () => void navigate({ to: "/formularios" }) },
              ]}
            />
          </>
        }
      />
      {canManage && (
        <Button variant="primary" className="sm:hidden" onClick={() => setAdding(true)}>
          {t("ui.add.member")}
        </Button>
      )}
      {link.error && <ErrorBox error={link.error} />}
      {members.data!.length === 0 ? (
        <EmptyState
          title={t("ui.team.empty")}
          action={canManage ? <Button onClick={() => setAdding(true)}>{t("ui.add.member")}</Button> : undefined}
        />
      ) : (
        <DataTable columns={columns.filter((c) => c.id !== "last" || members.data!.some((m) => m.lastSyncAt))} rows={members.data!} rowKey={(m) => m.userId} caption={t("ui.team.title")} />
      )}
      {removing && (
        <ConfirmModal
          title={removing.fullName}
          message={t("ui.confirm.delete", { name: removing.fullName })}
          confirmLabel={t("ui.common.removeMember")}
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
        <Modal title={`${t("ui.link.device")} · ${qr.member.fullName}`} onClose={() => setQr(null)}>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border border-linea bg-papel p-4">
              <QRCodeSVG value={qr.qr} size={240} />
            </div>
            <p className="text-center text-sm text-tinta-2">{t("ui.link.help")}</p>
            <p className="num text-xs text-tinta-2">{t("ui.common.expires", { date: fmtDateTime(qr.expiresAt) })}</p>
          </div>
        </Modal>
      )}
    </Page>
  );
}
