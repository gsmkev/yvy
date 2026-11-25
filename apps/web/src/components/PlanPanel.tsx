/** Plan, topes y uso de la organización, y el pedido de cambio (solo el dueño). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Billing, PlanView } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDate, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { PlanPrice } from "./PlanPrice";
import { AskForm, LastResolved, PendingRequest } from "./plan/PlanRequest";
import { Button, ErrorBox, SectionHead, Spinner, Stat } from "./ui";

const cap = (n: number | null) => (n === null ? t("ui.plan.noCap") : fmtNum(n));
const over = (used: number, max: number | null) => max !== null && used >= max;

/** Hectáreas y personas en uso frente a los topes del plan. */
function PlanUsage({ p }: { p: PlanView }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-6 sm:max-w-sm">
      <Stat label={t("ui.plan.hectares")} value={fmtNum(p.usage.ha)} unit={`/ ${cap(p.limits.maxHa)}`} tone={over(p.usage.ha, p.limits.maxHa) ? "danger" : undefined} />
      <Stat label={t("ui.plan.people")} value={fmtNum(p.usage.users)} unit={`/ ${cap(p.limits.maxUsers)}`} tone={over(p.usage.users, p.limits.maxUsers) ? "danger" : undefined} />
    </dl>
  );
}

/** Pedido pendiente, o el último resultado y la acción para pedir un cambio. */
function PlanRequestArea({ p, billing }: { p: PlanView; billing: Billing }) {
  const [open, setOpen] = useState(false);
  if (p.pending) return <PendingRequest pending={p.pending} />;
  return (
    <>
      {p.lastResolved && <LastResolved r={p.lastResolved} />}
      {open ? (
        <AskForm plan={p} billing={billing} onClose={() => setOpen(false)} />
      ) : (
        <Button className="mt-4" onClick={() => setOpen(true)}>
          {t("ui.plan.ask")}
        </Button>
      )}
    </>
  );
}

/** Plan, topes y uso de la organización, y el pedido de cambio (solo el dueño). No cobra: el pedido lo aprueba el equipo de Yvy. */
export function PlanPanel() {
  const q = useQuery({ queryKey: ["plan"], queryFn: () => get<PlanView>("/org/plan") });
  const [billing, setBilling] = useState<Billing>("annual");
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data!;
  return (
    <section aria-labelledby="plan-title">
      <h2 id="plan-title" className="sr-only">
        {t("ui.plan.title")}
      </h2>
      <SectionHead title={t("ui.plan.title")} />
      <p className="mt-3">
        <span className="font-medium">{tk(`ui.plan.name_${p.plan}`)}</span>
        {p.plan === "trial" && p.trialEndsAt ? <span className="block text-sm text-tinta-2">{t("ui.common.trialEnds", { date: fmtDate(p.trialEndsAt) })}</span> : null}
      </p>
      <PlanUsage p={p} />
      <PlanPrice billing={billing} onBilling={setBilling} />
      <PlanRequestArea p={p} billing={billing} />
    </section>
  );
}
