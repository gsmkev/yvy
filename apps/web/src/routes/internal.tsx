import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorBox, Field, Input, Modal, Select, Spinner, toast } from "../components/ui";
import { get, post } from "../lib/api";
import { fmtDate, fmtHa, fmtNum } from "../lib/format";
import { t } from "../lib/i18n";

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
}

/** Métricas del PRD §4 por organización (solo equipo Yvy). */
export function InternalPage() {
  const [editing, setEditing] = useState<OrgMetrics | null>(null);
  const q = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () =>
      get<{ organizations: OrgMetrics[]; usage: { metric: string; value: number; limit: number | null }[] }>(
        "/admin/metrics",
      ),
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
                <td className="num px-3 py-2">
                  {o.limits.maxHa === null ? "∞" : fmtNum(o.limits.maxHa)} ha · {o.users}/
                  {o.limits.maxUsers === null ? "∞" : o.limits.maxUsers}
                </td>
                <td className="px-3 py-2">
                  <button className="cursor-pointer underline underline-offset-4" onClick={() => setEditing(o)}>
                    {t("ui.internalEditPlan")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PlanModal org={editing} onClose={() => setEditing(null)} />}
    </div>
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
