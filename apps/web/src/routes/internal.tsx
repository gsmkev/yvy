import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionMenu } from "../components/menus";
import { Button, DataTable, EmptyState, ErrorBox, Field, FilterBar, Input, Modal, Page, SectionHead, Select, Spinner, Stat, toast } from "../components/ui";
import { enterSupport, get, post, qs, type Session } from "../lib/api";
import { fmtDate, fmtDateTime, fmtHa, fmtNum } from "../lib/format";
import { AuditList, type AuditEntryRow } from "../components/AuditList";
import { t, tk } from "../lib/i18n";

interface OrgMetrics {
  id: string;
  name: string;
  plan: string;
  trialEndsAt: number | null;
  maxHaOwn: number | null;
  maxUsersOwn: number | null;
  limits: { maxHa: number | null; maxUsers: number | null };
  users: number;
  farms: number;
  ha: number;
  workers: number;
  records7d: number;
  activeWorkers7d: number;
  recordsPerActiveWorker: number | null;
  owners: number;
  ownersActivePct: number | null;
  usefulPct: number | null;
  lastActive: string | null;
  /** V-05: código de referido con el que se registró y agrónomo dueño del código. */
  referredBy: string | null;
  referrerName: string | null;
  /** V-06: quién lo refirió (si se pudo identificar) y cuándo el equipo anotó el crédito. */
  referrerUserId: string | null;
  referralCreditedAt: number | null;
}

/** Métricas del PRD §4 por organización (solo equipo Yvy). */
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
        `/admin/metrics${qs({ q: term })}`,
      ),
  });
  const extend = useMutation({
    mutationFn: (id: string) => post(`/admin/orgs/${id}/extend-trial`, { days: 30 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
      toast(t("ui.internalTrialExtended"));
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
  const usageLabel = (m: string) => (m === "d1_bytes" || m === "r2_photo_bytes" ? t(`ui.usageMetric_${m}`) : m);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`);
  return (
    <Page width="data" title={t("ui.internalTitle")}>
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
        <Field label={t("ui.internalSearch")}>
          <Input
            type="search"
            className="w-full min-w-64 sm:w-96"
            placeholder={t("ui.internalSearchHint")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </FilterBar>
      {extend.error && <ErrorBox error={extend.error} />}
      {support.error && <ErrorBox error={support.error} />}
      <DataTable
        caption={t("ui.internalTitle")}
        rows={d.organizations}
        rowKey={(o) => o.id}
        empty={<EmptyState compact title={t("ui.internalNoResults")} />}
        columns={[
          { id: "org", header: t("ui.internalOrg"), sort: (a, b) => a.name.localeCompare(b.name), cell: (o) => <span className="whitespace-nowrap">{o.name}</span> },
          {
            id: "plan",
            header: t("ui.internalPlan"),
            cell: (o) => (
              <span className="whitespace-nowrap font-normal">
                {o.plan}
                {o.plan === "trial" && o.trialEndsAt ? ` · ${fmtDate(o.trialEndsAt)}` : ""}
              </span>
            ),
          },
          { id: "farms", header: t("ui.internalFarms"), align: "right", hideBelow: "md", cell: (o) => o.farms },
          { id: "ha", header: t("ui.internalArea"), align: "right", hideBelow: "md", cell: (o) => fmtHa(o.ha) },
          { id: "workers", header: t("ui.internalWorkers"), align: "right", hideBelow: "lg", cell: (o) => o.workers },
          { id: "records", header: t("ui.internalRecords7d"), align: "right", sort: (a, b) => a.records7d - b.records7d, cell: (o) => o.records7d },
          {
            id: "perWorker",
            header: t("ui.internalPerWorker"),
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
            header: t("ui.internalOwnersActive"),
            align: "right",
            hideBelow: "lg",
            cell: (o) => <span className={o.ownersActivePct !== null && o.ownersActivePct < 70 ? "text-alerta" : ""}>{pct(o.ownersActivePct)}</span>,
          },
          { id: "useful", header: t("ui.internalUseful"), align: "right", hideBelow: "lg", cell: (o) => pct(o.usefulPct) },
          { id: "last", header: t("ui.internalLastActive"), hideBelow: "md", cell: (o) => <span className="whitespace-nowrap font-normal">{o.lastActive ?? "—"}</span> },
          {
            id: "referral",
            header: t("ui.internalReferral"),
            hideBelow: "lg",
            cell: (o) => (
              <div className="font-normal">
                {o.referredBy ? `${o.referrerName ?? t("ui.internalReferralUnknown")} · ${o.referredBy}` : "—"}
                {o.referrerUserId && (
                  <div className="text-xs text-tinta-2">
                    {o.referralCreditedAt ? `${t("ui.internalReferralCredited", { date: fmtDate(o.referralCreditedAt) })} · ` : ""}
                    <button className="cursor-pointer underline underline-offset-4" onClick={() => credit.mutate({ id: o.id, credited: !o.referralCreditedAt })}>
                      {o.referralCreditedAt ? t("ui.internalReferralCreditUndo") : t("ui.internalReferralCredit")}
                    </button>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "limits",
            header: t("ui.internalLimits"),
            hideBelow: "lg",
            cell: (o) => (
              <span className="num whitespace-nowrap font-normal">
                {o.limits.maxHa === null ? "∞" : fmtNum(o.limits.maxHa)} ha · {o.users}/{o.limits.maxUsers === null ? "∞" : o.limits.maxUsers}
              </span>
            ),
          },
          {
            id: "actions",
            header: <span className="sr-only">{t("ui.internalActions")}</span>,
            cell: (o) => (
              <div className="flex justify-end">
                <ActionMenu
                  label={t("ui.rowActions", { name: o.name })}
                  items={[
                    { label: t("ui.internalEditPlan"), onSelect: () => setEditing(o) },
                    o.plan !== "active" && o.plan !== "demo" && { label: t("ui.internalExtend"), onSelect: () => extend.mutate(o.id) },
                    { label: t("ui.internalChanges"), onSelect: () => setChanges(o) },
                    { label: t("ui.internalSupport"), onSelect: () => support.mutate(o.id) },
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

interface TrialRequestRow {
  id: string;
  name: string;
  whatsapp: string;
  company: string | null;
  crops: string[];
  hectares: number | null;
  employees: number | null;
  department: string | null;
  createdAt: number;
}

/** Pedidos de prueba del formulario de la landing. El equipo escribe por WhatsApp y los marca como atendidos. */
function TrialRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-trial-requests"], queryFn: () => get<TrialRequestRow[]>("/admin/trial-requests") });
  const done = useMutation({
    mutationFn: (id: string) => post(`/admin/trial-requests/${id}/contacted`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-trial-requests"] });
      toast(t("ui.internalTrialMarked"));
    },
  });
  if (!q.data) return null;
  return (
    <section>
      <SectionHead title={t("ui.internalTrialRequests")} />
      {!q.data.length && <EmptyState compact title={t("ui.internalTrialRequestsNone")} />}
      {done.error && <ErrorBox error={done.error} />}
      <ul className="mt-2 divide-y divide-linea">
        {q.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.name}
                {r.company ? ` · ${r.company}` : ""}
              </p>
              <p className="num text-tinta-2">
                <a className="underline" href={`https://wa.me/${r.whatsapp}`} target="_blank" rel="noreferrer">
                  +{r.whatsapp}
                </a>
                {" · "}
                {[
                  r.crops.join(", "),
                  r.hectares !== null ? fmtHa(r.hectares) : null,
                  r.employees !== null ? t("ui.internalTrialEmployees", { n: fmtNum(r.employees) }) : null,
                  r.department,
                  fmtDateTime(r.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button disabled={done.isPending} onClick={() => done.mutate(r.id)}>
              {t("ui.internalTrialContacted")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
function PlanRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-plan-requests"], queryFn: () => get<PlanRequestRow[]>("/admin/plan-requests") });
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);
  const done = (msg: "ui.internalPlanApproved" | "ui.internalPlanRejected") => () => {
    setRejecting(null);
    qc.invalidateQueries({ queryKey: ["admin-plan-requests"] });
    qc.invalidateQueries({ queryKey: ["admin-metrics"] });
    toast(t(msg));
  };
  const approve = useMutation({
    mutationFn: (id: string) => post(`/admin/plan-requests/${id}/approve`, {}),
    onSuccess: done("ui.internalPlanApproved"),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; note: string }) => post(`/admin/plan-requests/${v.id}/reject`, { note: v.note.trim() || null }),
    onSuccess: done("ui.internalPlanRejected"),
  });
  if (!q.data) return null;
  return (
    <section>
      <SectionHead title={t("ui.internalPlanRequests")} />
      {!q.data.length && <EmptyState compact title={t("ui.internalPlanRequestsNone")} />}
      {(approve.error || reject.error) && <ErrorBox error={approve.error ?? reject.error} />}
      <ul className="mt-2 divide-y divide-linea">
        {q.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.organization} · {t("ui.internalPlanAsks", { from: r.currentPlan, plan: r.plan })}
              </p>
              <p className="num text-tinta-2">
                {[
                  r.maxHa ? t("ui.planUpToHa", { n: fmtNum(r.maxHa) }) : null,
                  r.maxUsers ? t("ui.planUpToUsers", { n: fmtNum(r.maxUsers) }) : null,
                  r.requester,
                  fmtDateTime(r.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.note && <p className="text-tinta-2">“{r.note}”</p>}
            </div>
            {rejecting?.id === r.id ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  reject.mutate(rejecting);
                }}
              >
                <Input
                  aria-label={t("ui.internalPlanRejectNote")}
                  placeholder={t("ui.internalPlanRejectNote")}
                  value={rejecting.note}
                  onChange={(e) => setRejecting({ id: r.id, note: e.target.value })}
                />
                <Button type="submit" variant="danger" disabled={reject.isPending}>
                  {t("ui.internalPlanReject")}
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="primary" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                  {t("ui.internalPlanApprove")}
                </Button>
                <Button onClick={() => setRejecting({ id: r.id, note: "" })}>{t("ui.internalPlanReject")}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface FunnelData {
  days: number;
  steps: { name: string; orgs: number }[];
  views: { name: string; n: number }[];
  daily: { day: string; n: number }[];
}

/** P-03: embudo de activación (organizaciones nuevas de los últimos 90 días) y pantallas más usadas. */
function Funnel() {
  const q = useQuery({ queryKey: ["admin-funnel"], queryFn: () => get<FunnelData>("/admin/funnel") });
  if (!q.data) return null;
  const first = q.data.steps[0]?.orgs ?? 0;
  return (
    <section>
      <SectionHead title={t("ui.internalFunnel", { days: q.data.days })} />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        {q.data.steps.map((st) => (
          <Stat key={st.name} label={tk(`ui.funnel_${st.name}`)} value={st.orgs} note={first ? `${Math.round((100 * st.orgs) / first)} %` : "—"} size="lg" />
        ))}
      </div>
      {q.data.views.length > 0 && (
        <>
          <div className="mt-6"><SectionHead title={t("ui.internalViews")} /></div>
          <p className="text-xs text-tinta-2">{t("ui.internalViewsNote")}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {q.data.views.map((v) => (
              <li key={v.name} className="num">
                {v.name.replace("view:", "")} · {fmtNum(v.n)}
              </li>
            ))}
          </ul>
        </>
      )}
      {q.data.daily.length > 0 && (
        <>
          <div className="mt-6"><SectionHead title={t("ui.internalViewsDaily")} /></div>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-sm">
            {q.data.daily.map((d) => (
              <li key={d.day} className="num">
                {d.day.slice(5)} · {fmtNum(d.n)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface AuditRow {
  id: string;
  action: string;
  organizationId: string | null;
  detail: string;
  createdAt: number;
  actor: string | null;
}

/** P-12: últimas acciones del equipo sobre organizaciones de clientes. */
function AuditLog() {
  const q = useQuery({ queryKey: ["admin-audit"], queryFn: () => get<AuditRow[]>("/admin/audit") });
  if (!q.data?.length) return null;
  return (
    <section>
      <SectionHead title={t("ui.internalAudit")} />
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {q.data.slice(0, 20).map((r) => (
          <li key={r.id} className="num">
            {fmtDateTime(r.createdAt)} · {r.actor ?? "—"} · {tk(`ui.internalAudit_${r.action}`)} · {r.organizationId ?? ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

const dayOf = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

/** P-10: plan, fin de la prueba y topes propios de una organización (vacío = los del plan). */
function PlanModal({ org, onClose }: { org: OrgMetrics; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    plan: org.plan,
    trialEndsAt: dayOf(org.trialEndsAt),
    maxHa: org.maxHaOwn?.toString() ?? "",
    maxUsers: org.maxUsersOwn?.toString() ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      post(`/admin/orgs/${org.id}/plan`, {
        plan: f.plan,
        trialEndsAt: f.trialEndsAt ? Date.parse(`${f.trialEndsAt}T23:59:59-03:00`) : null,
        maxHa: f.maxHa ? Number(f.maxHa.replace(",", ".")) : null,
        maxUsers: f.maxUsers ? Number(f.maxUsers) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
      toast(t("ui.internalPlanSaved"));
      onClose();
    },
  });
  return (
    <Modal title={`${t("ui.internalEditPlan")}: ${org.name}`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("ui.internalPlan")}>
          <Select
            value={f.plan}
            onChange={(e) => setF({ ...f, plan: e.target.value })}
            options={["trial", "active", "blocked", "demo"].map((p) => ({ value: p, label: p }))}
          />
        </Field>
        <Field label={t("ui.internalTrialEnds")}>
          <Input type="date" value={f.trialEndsAt} onChange={(e) => setF({ ...f, trialEndsAt: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.internalMaxHa")} hint={t("ui.internalLimitHint")}>
            <Input inputMode="decimal" value={f.maxHa} onChange={(e) => setF({ ...f, maxHa: e.target.value })} />
          </Field>
          <Field label={t("ui.internalMaxUsers")} hint={t("ui.internalLimitHint")}>
            <Input inputMode="numeric" value={f.maxUsers} onChange={(e) => setF({ ...f, maxUsers: e.target.value })} />
          </Field>
        </div>
        {save.error && <ErrorBox error={save.error} />}
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
      </form>
    </Modal>
  );
}

/** K-06: últimos cambios que hicieron las personas de una organización (solo lectura, para soporte). */
function OrgChanges({ org, onClose }: { org: OrgMetrics; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-audit-org", org.id],
    queryFn: () => get<AuditEntryRow[]>(`/admin/audit${qs({ orgId: org.id, scope: "org" })}`),
  });
  return (
    <Modal title={`${t("ui.internalChanges")} · ${org.name}`} onClose={onClose}>
      {q.isPending && <Spinner />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && !q.data.length && <EmptyState compact title={t("ui.auditEmpty")} />}
      {q.data && <AuditList rows={q.data} />}
    </Modal>
  );
}
