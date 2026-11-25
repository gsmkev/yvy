/** Equipo de la organización: miembros, roles, accesos, PIN y baja. */
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { TableExportMenu } from "../components/TableExportMenu";
import { ActionMenu } from "../components/menus";
import { Button, ConfirmModal, DataTable, EmptyState, ErrorBox, Modal, Page, PageHeader, Spinner } from "../components/ui";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { Member } from "../lib/types";
import { AddMember } from "./team/AddMember";
import { PinDialog } from "./team/PinDialog";
import { AssignPlots } from "./team/AssignPlots";
import { FarmAccess } from "./team/FarmAccess";
import { teamColumns } from "./team/teamColumns";
import { useTeam, type LinkQr } from "./team/useTeam";

/** Código QR que el miembro escanea con su celular. */
function LinkQrModal({ qr, onClose }: { qr: LinkQr; onClose: () => void }) {
  return (
    <Modal title={`${t("ui.link.device")}: ${qr.member.fullName}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-lg border border-linea bg-papel p-4">
          <QRCodeSVG value={qr.qr} size={240} />
        </div>
        <p className="text-center text-sm text-tinta-2">{t("ui.link.help")}</p>
        <p className="num text-xs text-tinta-2">{t("ui.common.expires", { date: fmtDateTime(qr.expiresAt) })}</p>
      </div>
    </Modal>
  );
}

/** Otras pantallas que cuelgan del equipo, según el rol. */
function TeamMenu({ members, owner, canManage }: { members: Member[]; owner: boolean; canManage: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <TableExportMenu
        data={() => ({
          name: t("ui.team.file"),
          headers: [t("ui.common.name"), t("ui.common.role"), t("ui.common.emailCol"), t("ui.common.phone")],
          rows: members.map((m) => [m.fullName, tk(`ui.role.${m.role}`), m.email, m.phone]),
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
  );
}

/** Lista de miembros con alta, cambio de acceso y baja. */
export function TeamPage() {
  const [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<LinkQr | null>(null);
  const [assigning, setAssigning] = useState<Member | null>(null);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [scoping, setScoping] = useState<Member | null>(null);
  const { me, members, link, remove, farmsOf } = useTeam(setQr, () => setRemoving(null));
  if (members.isLoading) return <Spinner rows={5} h={64} />;
  if (members.error) return <ErrorBox error={members.error} />;
  const list = members.data ?? [];
  const owner = me.data?.role === "owner";
  const canManage = owner || me.data?.role === "admin";
  const addButton = (className?: string) => (
    <Button variant="primary" className={className} onClick={() => setAdding(true)}>
      {t("ui.add.member")}
    </Button>
  );
  const columns = teamColumns({
    owner,
    canManage,
    meId: me.data?.user.id,
    farmsOf,
    onAssign: setAssigning,
    onScope: setScoping,
    onLink: link.mutate,
    onPin: setPinFor,
    onRemove: setRemoving,
  });
  return (
    <Page width="data">
      <PageHeader className="max-sm:flex-wrap" title={t("ui.team.title")} primary={canManage ? addButton("max-sm:hidden") : undefined} menu={<TeamMenu members={list} owner={owner} canManage={canManage} />} />
      {canManage && addButton("sm:hidden")}
      {link.error && <ErrorBox error={link.error} />}
      {list.length === 0 ? (
        <EmptyState title={t("ui.team.empty")} action={canManage ? addButton() : undefined} />
      ) : (
        <DataTable columns={columns} rows={list} rowKey={(m) => m.userId} caption={t("ui.team.title")} />
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
      {adding && <AddMember canAddAdmins={owner} onClose={() => setAdding(false)} />}
      {assigning && <AssignPlots member={assigning} onClose={() => setAssigning(null)} />}
      {pinFor && <PinDialog member={pinFor} onClose={() => setPinFor(null)} />}
      {qr && <LinkQrModal qr={qr} onClose={() => setQr(null)} />}
    </Page>
  );
}
