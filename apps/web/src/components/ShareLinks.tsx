/** Enlaces temporales de solo lectura para un banco o auditor. Solo el dueño. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, ErrorBox, Modal, toast } from "./ui";

interface LinkRow {
  id: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

/** Diálogo para crear y revocar enlaces de solo lectura; el enlace completo se muestra una sola vez. */
export function ShareLinksModal({ farmId, onClose }: { farmId: string; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const isOwner = me.data?.role === "owner";
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const links = useQuery({
    enabled: isOwner,
    queryKey: ["share-links", farmId],
    queryFn: () => get<LinkRow[]>(`/org/farms/${farmId}/share-links`),
  });
  const create = useMutation({
    mutationFn: (days: number) =>
      post<{ token: string }>(`/org/farms/${farmId}/share-links`, { days }),
    onSuccess: (r) => {
      setCopied(false);
      toast(t("ui.toast.shareCreated"));
      setFresh(`${window.location.origin}/compartido/${r.token}`);
      return qc.invalidateQueries({ queryKey: ["share-links", farmId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/org/share-links/${id}`),
    onSuccess: () => {
      toast(t("ui.toast.shareRevoked"));
      return qc.invalidateQueries({ queryKey: ["share-links", farmId] });
    },
  });
  if (!isOwner) return null;
  const now = Date.now();
  return (
    <Modal title={t("ui.share.linkTitle")} onClose={onClose}>
      <p className="text-sm text-tinta-2">{t("ui.share.linkIntro")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => create.mutate(7)} disabled={create.isPending}>
          {t("ui.share.linkCreate7")}
        </Button>
        <Button variant="secondary" onClick={() => create.mutate(30)} disabled={create.isPending}>
          {t("ui.share.linkCreate30")}
        </Button>
      </div>
      {create.error ? <ErrorBox error={create.error} /> : null}
      {fresh && (
        <div className="mt-4 rounded-lg border border-linea bg-papel p-3">
          <p className="num text-sm break-all">{fresh}</p>
          <p className="mt-1 text-xs text-tinta-2">{t("ui.share.linkNewNote")}</p>
          <div className="mt-2 flex items-center gap-3">
            <Button
              onClick={() =>
                navigator.clipboard.writeText(fresh).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {t("ui.share.linkCopy")}
            </Button>
            {copied && <span className="text-sm text-tinta-2">{t("ui.share.linkCopied")}</span>}
          </div>
        </div>
      )}
      {links.data && links.data.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-tinta-2">{t("ui.share.linkList")}</h3>
          <ul className="mt-1 divide-y divide-linea border-y border-linea text-sm">
            {links.data.map((l) => {
              const live = l.revokedAt === null && l.expiresAt > now;
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="num">
                    {fmtDate(l.createdAt)},{" "}
                    {l.revokedAt !== null
                      ? t("ui.share.linkRevoked")
                      : live
                        ? t("ui.share.linkActive", { date: fmtDate(l.expiresAt) })
                        : t("ui.share.linkExpired", { date: fmtDate(l.expiresAt) })}
                  </span>
                  {live && (
                    <Button variant="danger" className="h-8" onClick={() => revoke.mutate(l.id)}>
                      {t("ui.share.linkRevoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
