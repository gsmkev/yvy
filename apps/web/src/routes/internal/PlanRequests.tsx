import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorBox, Form, Input, SectionHead, toast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { fmtDateTime, fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";

interface PlanRequestRow {
  id: string;
  organization: string;
  currentPlan: string;
  plan: string;
  maxHa: number | null;
  maxUsers: number | null;
  note: string | null;
  createdAt: number;
  requester: string | null;
}

/** P-10: pedidos de plan que hicieron los dueños desde la web. Aprobar aplica el plan y los topes; no cobra. */
export function PlanRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-plan-requests"], queryFn: () => get<PlanRequestRow[]>("/admin/plan-requests") });
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);
  const done = (msg: "ui.internal.planApproved" | "ui.internal.planRejected") => () => {
    setRejecting(null);
    qc.invalidateQueries({ queryKey: ["admin-plan-requests"] });
    qc.invalidateQueries({ queryKey: ["admin-metrics"] });
    toast(t(msg));
  };
  const approve = useMutation({
    mutationFn: (id: string) => post(`/admin/plan-requests/${id}/approve`, {}),
    onSuccess: done("ui.internal.planApproved"),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; note: string }) => post(`/admin/plan-requests/${v.id}/reject`, { note: v.note.trim() || null }),
    onSuccess: done("ui.internal.planRejected"),
  });
  if (!q.data) return null;
  return (
    <section>
      <SectionHead title={t("ui.internal.planRequests")} />
      {!q.data.length && <EmptyState compact title={t("ui.internal.planRequestsNone")} />}
      {(approve.error || reject.error) && <ErrorBox error={approve.error ?? reject.error} />}
      <ul className="mt-2 divide-y divide-linea">
        {q.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.organization} · {t("ui.internal.planAsks", { from: r.currentPlan, plan: r.plan })}
              </p>
              <p className="num text-tinta-2">
                {[
                  r.maxHa ? t("ui.plan.upToHa", { n: fmtNum(r.maxHa) }) : null,
                  r.maxUsers ? t("ui.plan.upToUsers", { n: fmtNum(r.maxUsers) }) : null,
                  r.requester,
                  fmtDateTime(r.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.note && <p className="text-tinta-2">“{r.note}”</p>}
            </div>
            {rejecting?.id === r.id ? (
              <Form className="flex items-center gap-2" onSubmit={() => reject.mutate(rejecting)}>
                <Input
                  aria-label={t("ui.internal.planRejectNote")}
                  placeholder={t("ui.internal.planRejectNote")}
                  value={rejecting.note}
                  onChange={(e) => setRejecting({ id: r.id, note: e.target.value })}
                />
                <Button type="submit" variant="danger" disabled={reject.isPending}>
                  {t("ui.internal.planReject")}
                </Button>
              </Form>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="primary" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                  {t("ui.internal.planApprove")}
                </Button>
                <Button onClick={() => setRejecting({ id: r.id, note: "" })}>{t("ui.internal.planReject")}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
