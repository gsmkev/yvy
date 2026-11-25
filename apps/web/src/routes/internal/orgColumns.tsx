/** Columnas de la tabla de organizaciones del panel interno. */
import { ActionMenu } from "../../components/menus";
import type { Column } from "../../components/ui";
import { fmtDate, fmtHa, fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { OrgMetrics } from "./types";

/** Porcentaje entero, o raya si no hay dato. */
export const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`);

/** Qué se puede hacer con una organización desde la tabla. */
export interface OrgActions {
  onEditPlan: (o: OrgMetrics) => void;
  onExtend: (id: string) => void;
  onChanges: (o: OrgMetrics) => void;
  onSupport: (id: string) => void;
  onCredit: (id: string, credited: boolean) => void;
}

function PlanCell({ o }: { o: OrgMetrics }) {
  return (
    <span className="whitespace-nowrap font-normal">
      {o.plan}
      {o.plan === "trial" && o.trialEndsAt ? <span className="block text-xs text-tinta-2">{fmtDate(o.trialEndsAt)}</span> : null}
    </span>
  );
}

function ReferralCell({ o, onCredit }: { o: OrgMetrics; onCredit: OrgActions["onCredit"] }) {
  return (
    <div className="font-normal">
      {o.referredBy ? `${o.referrerName ?? t("ui.internal.referralUnknown")}, ${o.referredBy}` : "—"}
      {o.referrerUserId && (
        <div className="text-xs text-tinta-2">
          {o.referralCreditedAt ? <span className="block">{t("ui.internal.referralCredited", { date: fmtDate(o.referralCreditedAt) })}</span> : null}
          <button className="cursor-pointer underline underline-offset-4" onClick={() => onCredit(o.id, !o.referralCreditedAt)}>
            {o.referralCreditedAt ? t("ui.internal.referralCreditUndo") : t("ui.internal.referralCredit")}
          </button>
        </div>
      )}
    </div>
  );
}

function LimitsCell({ o }: { o: OrgMetrics }) {
  return (
    <span className="num whitespace-nowrap font-normal">
      {o.limits.maxHa === null ? "∞" : fmtNum(o.limits.maxHa)} ha
      <span className="block text-xs text-tinta-2">
        {o.users}/{o.limits.maxUsers === null ? "∞" : o.limits.maxUsers}
      </span>
    </span>
  );
}

const lowWhen = (v: number | null, min: number) => (v !== null && v < min ? "text-alerta" : "");

/** Columnas de las organizaciones con sus métricas de uso y el menú de acciones. */
export function orgColumns(a: OrgActions): Column<OrgMetrics>[] {
  return [
    { id: "org", header: t("ui.internal.org"), sort: (x, y) => x.name.localeCompare(y.name), cell: (o) => <span className="whitespace-nowrap">{o.name}</span> },
    { id: "plan", header: t("ui.internal.plan"), cell: (o) => <PlanCell o={o} /> },
    { id: "farms", header: t("ui.internal.farms"), align: "right", hideBelow: "md", cell: (o) => o.farms },
    { id: "ha", header: t("ui.internal.area"), align: "right", hideBelow: "md", cell: (o) => fmtHa(o.ha) },
    { id: "workers", header: t("ui.internal.workers"), align: "right", hideBelow: "lg", cell: (o) => o.workers },
    { id: "records", header: t("ui.internal.records7d"), align: "right", sort: (x, y) => x.records7d - y.records7d, cell: (o) => o.records7d },
    { id: "perWorker", header: t("ui.internal.perWorker"), align: "right", hideBelow: "lg", cell: (o) => <span className={lowWhen(o.recordsPerActiveWorker, 10)}>{o.recordsPerActiveWorker === null ? "—" : fmtNum(o.recordsPerActiveWorker)}</span> },
    { id: "ownersActive", header: t("ui.internal.ownersActive"), align: "right", hideBelow: "lg", cell: (o) => <span className={lowWhen(o.ownersActivePct, 70)}>{pct(o.ownersActivePct)}</span> },
    { id: "useful", header: t("ui.internal.useful"), align: "right", hideBelow: "lg", cell: (o) => pct(o.usefulPct) },
    { id: "last", header: t("ui.internal.lastActive"), hideBelow: "md", cell: (o) => <span className="whitespace-nowrap font-normal">{o.lastActive ?? "—"}</span> },
    { id: "referral", header: t("ui.internal.referral"), hideBelow: "lg", cell: (o) => <ReferralCell o={o} onCredit={a.onCredit} /> },
    { id: "limits", header: t("ui.internal.limits"), hideBelow: "lg", cell: (o) => <LimitsCell o={o} /> },
    {
      id: "actions",
      header: <span className="sr-only">{t("ui.internal.actions")}</span>,
      cell: (o) => (
        <div className="flex justify-end">
          <ActionMenu
            label={t("ui.row.actions", { name: o.name })}
            items={[
              { label: t("ui.internal.editPlan"), onSelect: () => a.onEditPlan(o) },
              o.plan !== "active" && o.plan !== "demo" && { label: t("ui.internal.extend"), onSelect: () => a.onExtend(o.id) },
              { label: t("ui.internal.changes"), onSelect: () => a.onChanges(o) },
              { label: t("ui.internal.support"), onSelect: () => a.onSupport(o.id) },
            ]}
          />
        </div>
      ),
    },
  ];
}
