import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorBox, Field, FormActions, Input, Modal, Select, Spinner, toast } from "../components/ui";
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
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`);
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-serif text-2xl font-semibold">{t("ui.internalTitle")}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {d.usage.map((u) => (
          <Card key={u.metric}>
            <div className="eyebrow">{u.metric}</div>
            <div className="text-xl font-semibold">{u.limit ? pct((100 * u.value) / u.limit) : fmtNum(u.value)}</div>
          </Card>
        ))}
      </div>
      <Field label={t("ui.internalSearch")}>
        <Input
          type="search"
          className="max-w-md"
          placeholder={t("ui.internalSearchHint")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      {extend.error && <ErrorBox error={extend.error} />}
      {support.error && <ErrorBox error={support.error} />}
      {!d.organizations.length && <p className="text-sm text-tinta-2">{t("ui.internalNoResults")}</p>}
      <div className="overflow-auto rounded-lg border border-linea bg-papel">
        <table className="w-full text-sm">
          <thead className="eyebrow bg-lino text-left">
            <tr>
              {(
                [
                  "internalOrg",
                  "internalPlan",
                  "internalFarms",
                  "internalArea",
                  "internalWorkers",
                  "internalRecords7d",
                  "internalPerWorker",
                  "internalOwnersActive",
                  "internalUseful",
                  "internalLastActive",
                  "internalReferral",
                  "internalLimits",
                  "internalActions",
                ] as const
              )
                .map((k) => t(`ui.${k}`))
                .map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {d.organizations.map((o) => (
              <tr key={o.id} className="border-t border-surco/10">
                <td className="px-3 py-2 font-medium">{o.name}</td>
                <td className="px-3 py-2">
                  {o.plan}
                  {o.plan === "trial" && o.trialEndsAt ? ` · ${fmtDate(o.trialEndsAt)}` : ""}
                </td>
                <td className="px-3 py-2">{o.farms}</td>
                <td className="px-3 py-2">{fmtHa(o.ha)}</td>
                <td className="px-3 py-2">{o.workers}</td>
                <td className="px-3 py-2">{o.records7d}</td>
                <td
                  className={`px-3 py-2 ${o.recordsPerActiveWorker !== null && o.recordsPerActiveWorker < 10 ? "text-alerta" : ""}`}
                >
                  {o.recordsPerActiveWorker === null ? "—" : fmtNum(o.recordsPerActiveWorker)}
                </td>
                <td
                  className={`px-3 py-2 ${o.ownersActivePct !== null && o.ownersActivePct < 70 ? "text-alerta" : ""}`}
                >
                  {pct(o.ownersActivePct)}
                </td>
                <td className="px-3 py-2">{pct(o.usefulPct)}</td>
                <td className="px-3 py-2">{o.lastActive ?? "—"}</td>
                <td className="px-3 py-2">
                  {o.referredBy ? `${o.referrerName ?? t("ui.internalReferralUnknown")} · ${o.referredBy}` : "—"}
                  {o.referrerUserId && (
                    <div className="text-xs">
                      {o.referralCreditedAt ? `${t("ui.internalReferralCredited", { date: fmtDate(o.referralCreditedAt) })} · ` : ""}
                      <button
                        className="cursor-pointer underline underline-offset-4"
                        onClick={() => credit.mutate({ id: o.id, credited: !o.referralCreditedAt })}
                      >
                        {o.referralCreditedAt ? t("ui.internalReferralCreditUndo") : t("ui.internalReferralCredit")}
                      </button>
                    </div>
                  )}
                </td>
                <td className="num px-3 py-2">
                  {o.limits.maxHa === null ? "∞" : fmtNum(o.limits.maxHa)} ha · {o.users}/
                  {o.limits.maxUsers === null ? "∞" : o.limits.maxUsers}
                </td>
                <td className="flex gap-4 px-3 py-2 whitespace-nowrap">
                  <button className="cursor-pointer underline underline-offset-4" onClick={() => setEditing(o)}>
                    {t("ui.internalEditPlan")}
                  </button>
                  {o.plan !== "active" && o.plan !== "demo" && (
                    <button
                      className="cursor-pointer underline underline-offset-4 disabled:opacity-50"
                      disabled={extend.isPending}
                      onClick={() => extend.mutate(o.id)}
                    >
                      {t("ui.internalExtend")}
                    </button>
                  )}
                  <button className="cursor-pointer underline underline-offset-4" onClick={() => setChanges(o)}>
                    {t("ui.internalChanges")}
                  </button>
                  <button
                    className="cursor-pointer underline underline-offset-4 disabled:opacity-50"
                    disabled={support.isPending}
                    onClick={() => support.mutate(o.id)}
                  >
                    {t("ui.internalSupport")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PlanModal org={editing} onClose={() => setEditing(null)} />}
      {changes && <OrgChanges org={changes} onClose={() => setChanges(null)} />}
      <TrialRequests />
      <PlanRequests />
      <Funnel />
      <AuditLog />
    </div>
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
      <h2 className="font-serif text-xl font-semibold">{t("ui.internalTrialRequests")}</h2>
      {!q.data.length && <p className="mt-2 text-sm text-tinta-2">{t("ui.internalTrialRequestsNone")}</p>}
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
      <h2 className="font-serif text-xl font-semibold">{t("ui.internalPlanRequests")}</h2>
      {!q.data.length && <p className="mt-2 text-sm text-tinta-2">{t("ui.internalPlanRequestsNone")}</p>}
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
      <h2 className="font-serif text-xl font-semibold">{t("ui.internalFunnel", { days: q.data.days })}</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
        {q.data.steps.map((st) => (
          <div key={st.name} className="flex flex-col gap-0.5">
            <span className="eyebrow">{tk(`ui.funnel_${st.name}`)}</span>
            <span className="num font-serif text-[28px] leading-tight font-semibold">{st.orgs}</span>
            <span className="text-xs text-tinta-2">{first ? `${Math.round((100 * st.orgs) / first)} %` : "—"}</span>
          </div>
        ))}
      </div>
      {q.data.views.length > 0 && (
        <>
          <h3 className="mt-5 font-semibold">{t("ui.internalViews")}</h3>
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
          <h3 className="mt-5 font-semibold">{t("ui.internalViewsDaily")}</h3>
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
      <h2 className="font-serif text-xl font-semibold">{t("ui.internalAudit")}</h2>
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
        <FormActions onCancel={onClose} disabled={save.isPending} />
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
      {q.data && !q.data.length && <p className="text-sm text-tinta-2">{t("ui.auditEmpty")}</p>}
      {q.data && <AuditList rows={q.data} />}
    </Modal>
  );
}
