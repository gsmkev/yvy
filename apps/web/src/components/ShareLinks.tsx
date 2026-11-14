/** Enlaces temporales de solo lectura para un banco o auditor (K-04). Solo el dueño. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, ErrorBox, toast } from "./ui";

interface LinkRow {
  id: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export function ShareLinksSection({ farmId }: { farmId: string }) {
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
      toast(t("ui.toastShareCreated"));
      setFresh(`${window.location.origin}/compartido/${r.token}`);
      return qc.invalidateQueries({ queryKey: ["share-links", farmId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/org/share-links/${id}`),
    onSuccess: () => {
      toast(t("ui.toastShareRevoked"));
      return qc.invalidateQueries({ queryKey: ["share-links", farmId] });
    },
  });
  if (!isOwner) return null;
  const now = Date.now();
  return (
    <section className="mt-8 border-t border-linea pt-6">
      <h2 className="text-[18px] leading-6 font-semibold">{t("ui.shareLinkTitle")}</h2>
      <p className="mt-1 text-sm text-tinta-2">{t("ui.shareLinkIntro")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => create.mutate(7)} disabled={create.isPending}>
          {t("ui.shareLinkCreate7")}
        </Button>
        <Button onClick={() => create.mutate(30)} disabled={create.isPending}>
          {t("ui.shareLinkCreate30")}
        </Button>
      </div>
      {create.error ? <ErrorBox error={create.error} /> : null}
      {fresh && (
        <div className="mt-4 rounded-lg border border-linea bg-papel p-3">
          <p className="num text-sm break-all">{fresh}</p>
          <p className="mt-1 text-xs text-tinta-2">{t("ui.shareLinkNewNote")}</p>
          <div className="mt-2 flex items-center gap-3">
            <Button
              onClick={() =>
                navigator.clipboard.writeText(fresh).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {t("ui.shareLinkCopy")}
            </Button>
            {copied && <span className="text-sm text-tinta-2">{t("ui.shareLinkCopied")}</span>}
          </div>
        </div>
      )}
      {links.data && links.data.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-tinta-2">{t("ui.shareLinkList")}</h3>
          <ul className="mt-1 divide-y divide-linea border-y border-linea text-sm">
            {links.data.map((l) => {
              const live = l.revokedAt === null && l.expiresAt > now;
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="num">
                    {fmtDate(l.createdAt)} ·{" "}
                    {l.revokedAt !== null
                      ? t("ui.shareLinkRevoked")
                      : live
                        ? t("ui.shareLinkActive", { date: fmtDate(l.expiresAt) })
                        : t("ui.shareLinkExpired", { date: fmtDate(l.expiresAt) })}
                  </span>
                  {live && (
                    <Button variant="danger" className="h-8" onClick={() => revoke.mutate(l.id)}>
                      {t("ui.shareLinkRevoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
