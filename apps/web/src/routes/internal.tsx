/** Métricas de uso por organización (solo equipo Yvy). */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionMenu } from "../components/menus";
import { DataTable, EmptyState, ErrorBox, Field, FilterBar, Input, Page, Spinner, Stat, toast } from "../components/ui";
import { enterSupport, get, post, withQs, type Session } from "../lib/api";
import { fmtDate, fmtHa, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import type { OrgMetrics } from "./internal/types";
import { TrialRequests } from "./internal/TrialRequests";
import { PlanRequests } from "./internal/PlanRequests";
import { Funnel } from "./internal/Funnel";
import { AuditLog } from "./internal/AuditLog";
import { OrgChanges, PlanModal } from "./internal/PlanModal";

/** Métricas de uso por organización (solo equipo Yvy). */
export function InternalPage() {
  const [editing, setEditing] = useState<OrgMetrics | null>(null);
  const [changes, setChanges] = useState<OrgMetrics | null>(null);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  // Busca en el servidor cuando se deja de escribir
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-metrics", term],
    placeholderData: (prev) => prev,
    queryFn: () =>
      get<{ organizations: OrgMetrics[]; usage: { metric: string; value: number; limit: number | null }[] }>(
        withQs("/admin/metrics", { q: term }),
      ),
  });
  const extend = useMutation({
    mutationFn: (id: string) => post(`/admin/orgs/${id}/extend-trial`, { days: 30 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
      toast(t("ui.internal.trialExtended"));
    },
  });
  const credit = useMutation({
    mutationFn: (v: { id: string; credited: boolean }) => post(`/admin/orgs/${v.id}/referral-credit`, { credited: v.credited }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-metrics"] }),
  });
  const support = useMutation({
    mutationFn: (id: string) => post<Session>(`/admin/orgs/${id}/support-session`),
    onSuccess: (s) => enterSupport(s),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const usageLabel = (m: string) => (m === "d1_bytes" || m === "r2_photo_bytes" ? t(`ui.usage.metric_${m}`) : m);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`);
  return (
    <Page width="data" title={t("ui.internal.title")}>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {d.usage.map((u) => (
          <Stat
            key={u.metric}
            label={usageLabel(u.metric)}
            value={u.limit ? pct((100 * u.value) / u.limit) : fmtNum(u.value)}
          />
        ))}
      </div>
      <FilterBar>
        <Field label={t("ui.internal.search")}>
          <Input
            type="search"
            className="w-full min-w-64 sm:w-96"
            placeholder={t("ui.internal.searchHint")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </FilterBar>
      {extend.error && <ErrorBox error={extend.error} />}
      {support.error && <ErrorBox error={support.error} />}
      <DataTable
        caption={t("ui.internal.title")}
        rows={d.organizations}
        rowKey={(o) => o.id}
        empty={<EmptyState compact title={t("ui.internal.noResults")} />}
        columns={[
          { id: "org", header: t("ui.internal.org"), sort: (a, b) => a.name.localeCompare(b.name), cell: (o) => <span className="whitespace-nowrap">{o.name}</span> },
          {
            id: "plan",
            header: t("ui.internal.plan"),
            cell: (o) => (
              <span className="whitespace-nowrap font-normal">
                {o.plan}
                {o.plan === "trial" && o.trialEndsAt ? ` · ${fmtDate(o.trialEndsAt)}` : ""}
              </span>
            ),
          },
          { id: "farms", header: t("ui.internal.farms"), align: "right", hideBelow: "md", cell: (o) => o.farms },
          { id: "ha", header: t("ui.internal.area"), align: "right", hideBelow: "md", cell: (o) => fmtHa(o.ha) },
          { id: "workers", header: t("ui.internal.workers"), align: "right", hideBelow: "lg", cell: (o) => o.workers },
          { id: "records", header: t("ui.internal.records7d"), align: "right", sort: (a, b) => a.records7d - b.records7d, cell: (o) => o.records7d },
          {
            id: "perWorker",
            header: t("ui.internal.perWorker"),
            align: "right",
            hideBelow: "lg",
            cell: (o) => (
              <span className={o.recordsPerActiveWorker !== null && o.recordsPerActiveWorker < 10 ? "text-alerta" : ""}>
                {o.recordsPerActiveWorker === null ? "—" : fmtNum(o.recordsPerActiveWorker)}
              </span>
            ),
          },
          {
            id: "ownersActive",
            header: t("ui.internal.ownersActive"),
            align: "right",
            hideBelow: "lg",
            cell: (o) => <span className={o.ownersActivePct !== null && o.ownersActivePct < 70 ? "text-alerta" : ""}>{pct(o.ownersActivePct)}</span>,
          },
          { id: "useful", header: t("ui.internal.useful"), align: "right", hideBelow: "lg", cell: (o) => pct(o.usefulPct) },
          { id: "last", header: t("ui.internal.lastActive"), hideBelow: "md", cell: (o) => <span className="whitespace-nowrap font-normal">{o.lastActive ?? "—"}</span> },
          {
            id: "referral",
            header: t("ui.internal.referral"),
            hideBelow: "lg",
            cell: (o) => (
              <div className="font-normal">
                {o.referredBy ? `${o.referrerName ?? t("ui.internal.referralUnknown")} · ${o.referredBy}` : "—"}
                {o.referrerUserId && (
                  <div className="text-xs text-tinta-2">
                    {o.referralCreditedAt
                      ? t("ui.internal.referralCredited", { date: fmtDate(o.referralCreditedAt) }) + " · "
                      : ""}
                    <button
                      className="cursor-pointer underline underline-offset-4"
                      onClick={() => credit.mutate({ id: o.id, credited: !o.referralCreditedAt })}
                    >
                      {o.referralCreditedAt ? t("ui.internal.referralCreditUndo") : t("ui.internal.referralCredit")}
                    </button>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "limits",
            header: t("ui.internal.limits"),
            hideBelow: "lg",
            cell: (o) => (
              <span className="num whitespace-nowrap font-normal">
                {o.limits.maxHa === null ? "∞" : fmtNum(o.limits.maxHa)} ha · {o.users}/{o.limits.maxUsers === null ? "∞" : o.limits.maxUsers}
              </span>
            ),
          },
          {
            id: "actions",
            header: <span className="sr-only">{t("ui.internal.actions")}</span>,
            cell: (o) => (
              <div className="flex justify-end">
                <ActionMenu
                  label={t("ui.row.actions", { name: o.name })}
                  items={[
                    { label: t("ui.internal.editPlan"), onSelect: () => setEditing(o) },
                    o.plan !== "active" && o.plan !== "demo" && { label: t("ui.internal.extend"), onSelect: () => extend.mutate(o.id) },
                    { label: t("ui.internal.changes"), onSelect: () => setChanges(o) },
                    { label: t("ui.internal.support"), onSelect: () => support.mutate(o.id) },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
      {editing && <PlanModal org={editing} onClose={() => setEditing(null)} />}
      {changes && <OrgChanges org={changes} onClose={() => setChanges(null)} />}
      <TrialRequests />
      <PlanRequests />
      <Funnel />
      <AuditLog />
    </Page>
  );
}
