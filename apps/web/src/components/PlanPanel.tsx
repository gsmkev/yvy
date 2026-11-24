import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LIMITS, type Billing } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtDate, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { PlanPrice } from "./PlanPrice";
import { Button, ErrorBox, Field, Form, Input, SectionHead, Spinner, Stat, toast } from "./ui";
import type { PlanRequestRow as PlanRequest, PlanView } from "@yvy/shared";

const cap = (n: number | null) => (n === null ? t("ui.plan.noCap") : fmtNum(n));

/** Plan, topes y uso de la organización, y el pedido de cambio (solo el dueño). No cobra: el pedido lo aprueba el equipo de Yvy. */
export function PlanPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["plan"], queryFn: () => get<PlanView>("/org/plan") });
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState<Billing>("annual");
  const [f, setF] = useState({ maxHa: "", maxUsers: "", note: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["plan"] });
  const send = useMutation({
    mutationFn: () =>
      post("/org/plan-request", {
        plan: "active",
        maxHa: f.maxHa ? Number(f.maxHa.replace(/\./g, "").replace(",", ".")) : null,
        maxUsers: f.maxUsers ? Number(f.maxUsers) : null,
        note: f.note.trim() || null,
        billing,
      }),
    onSuccess: () => {
      setOpen(false);
      setF({ maxHa: "", maxUsers: "", note: "" });
      toast(t("ui.plan.requestSent"));
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => del("/org/plan-request"),
    onSuccess: () => {
      toast(t("ui.plan.requestCancelled"));
      refresh();
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data!;
  const over = (used: number, max: number | null) => max !== null && used >= max;
  const requested = (r: PlanRequest) =>
    [
      tk(`ui.plan.name_${r.plan}`),
      r.maxHa ? t("ui.plan.upToHa", { n: fmtNum(r.maxHa) }) : null,
      r.maxUsers ? t("ui.plan.upToUsers", { n: fmtNum(r.maxUsers) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <section aria-labelledby="plan-title">
      <h2 id="plan-title" className="sr-only">
        {t("ui.plan.title")}
      </h2>
      <SectionHead title={t("ui.plan.title")} />
      <p className="mt-3">
        <span className="font-medium">{tk(`ui.plan.name_${p.plan}`)}</span>
        {p.plan === "trial" && p.trialEndsAt ? (
          <span className="text-tinta-2"> · {t("ui.common.trialEnds", { date: fmtDate(p.trialEndsAt) })}</span>
        ) : null}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-6 sm:max-w-sm">
        <Stat
          label={t("ui.plan.hectares")}
          value={fmtNum(p.usage.ha)}
          unit={`/ ${cap(p.limits.maxHa)}`}
          tone={over(p.usage.ha, p.limits.maxHa) ? "danger" : undefined}
        />
        <Stat
          label={t("ui.plan.people")}
          value={fmtNum(p.usage.users)}
          unit={`/ ${cap(p.limits.maxUsers)}`}
          tone={over(p.usage.users, p.limits.maxUsers) ? "danger" : undefined}
        />
      </dl>

      <PlanPrice billing={billing} onBilling={setBilling} />

      {p.pending ? (
        <div role="status" className="mt-4 border-l-2 border-trigo pl-3 text-sm">
          <p className="font-medium">{t("ui.plan.pending", { date: fmtDate(p.pending.createdAt) })}</p>
          <p className="text-tinta-2">{requested(p.pending)}</p>
          {p.pending.note && <p className="mt-1 text-tinta-2">“{p.pending.note}”</p>}
          <button
            type="button"
            className="mt-2 cursor-pointer font-medium text-accion underline underline-offset-4 disabled:opacity-50"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t("ui.plan.cancelRequest")}
          </button>
          {cancel.error && <ErrorBox error={cancel.error} />}
        </div>
      ) : (
        <>
          {p.lastResolved && (
            <p className="mt-4 text-sm text-tinta-2">
              {t(p.lastResolved.status === "approved" ? "ui.plan.lastApproved" : "ui.plan.lastRejected", {
                what: requested(p.lastResolved),
              })}
              {p.lastResolved.resolutionNote ? ` ${p.lastResolved.resolutionNote}` : ""}
            </p>
          )}
          {!open ? (
            <Button className="mt-4" onClick={() => setOpen(true)}>
              {t("ui.plan.ask")}
            </Button>
          ) : (
            <Form className="mt-4 flex max-w-md flex-col gap-3" onSubmit={() => send.mutate()}>
              <p className="text-sm text-tinta-2">
                {t("ui.plan.askIntro", {
                  ha: cap(p.plans.active.maxHa),
                  users: cap(p.plans.active.maxUsers),
                })}
              </p>
              <Field label={t("ui.plan.askHa")} hint={t("ui.plan.askOptional")}>
                <Input
                  inputMode="decimal"
                  value={f.maxHa}
                  onChange={(e) => setF({ ...f, maxHa: e.target.value })}
                />
              </Field>
              <Field label={t("ui.plan.askUsers")} hint={t("ui.plan.askOptional")}>
                <Input
                  inputMode="numeric"
                  value={f.maxUsers}
                  onChange={(e) => setF({ ...f, maxUsers: e.target.value })}
                />
              </Field>
              <Field label={t("ui.plan.askNote")} hint={t("ui.plan.askOptional")}>
                <Input
                  value={f.note}
                  maxLength={LIMITS.planRequest.noteLength}
                  onChange={(e) => setF({ ...f, note: e.target.value })}
                />
              </Field>
              <p className="text-sm text-tinta-2">{t("ui.plan.askNoCharge")}</p>
              {send.error && <ErrorBox error={send.error} />}
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={send.isPending}>
                  {t("ui.plan.askSend")}
                </Button>
                <button
                  type="button"
                  className="cursor-pointer text-sm text-tinta-2 underline underline-offset-4 hover:text-surco"
                  onClick={() => setOpen(false)}
                >
                  {t("ui.common.cancel")}
                </button>
              </div>
            </Form>
          )}
        </>
      )}
    </section>
  );
}
