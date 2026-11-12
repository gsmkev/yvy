import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LIMITS } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtDate, fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Field, Input, Spinner, toast } from "./ui";

interface PlanRequest {
  id: string;
  plan: string;
  maxHa: number | null;
  maxUsers: number | null;
  note: string | null;
  status: string;
  createdAt: number;
  resolutionNote: string | null;
}

interface PlanView {
  plan: string;
  trialEndsAt: number | null;
  limits: { maxHa: number | null; maxUsers: number | null };
  usage: { ha: number; users: number };
  plans: { active: { maxHa: number | null; maxUsers: number | null } };
  pending: PlanRequest | null;
  lastResolved: PlanRequest | null;
}

const cap = (n: number | null) => (n === null ? t("ui.planNoCap") : fmtNum(n));

/** P-10: plan, topes y uso de la organización, y el pedido de cambio (solo el dueño). No cobra: el pedido lo aprueba el equipo de Yvy. */
export function PlanPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["plan"], queryFn: () => get<PlanView>("/org/plan") });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ maxHa: "", maxUsers: "", note: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["plan"] });
  const send = useMutation({
    mutationFn: () =>
      post("/org/plan-request", {
        plan: "active",
        maxHa: f.maxHa ? Number(f.maxHa.replace(/\./g, "").replace(",", ".")) : null,
        maxUsers: f.maxUsers ? Number(f.maxUsers) : null,
        note: f.note.trim() || null,
      }),
    onSuccess: () => {
      setOpen(false);
      setF({ maxHa: "", maxUsers: "", note: "" });
      toast(t("ui.planRequestSent"));
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => del("/org/plan-request"),
    onSuccess: () => {
      toast(t("ui.planRequestCancelled"));
      refresh();
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data!;
  const over = (used: number, max: number | null) => max !== null && used >= max;
  const requested = (r: PlanRequest) =>
    [
      tk(`ui.planName_${r.plan}`),
      r.maxHa ? t("ui.planUpToHa", { n: fmtNum(r.maxHa) }) : null,
      r.maxUsers ? t("ui.planUpToUsers", { n: fmtNum(r.maxUsers) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <section className="mt-8" aria-labelledby="plan-title">
      <h2 id="plan-title" className="font-serif text-xl font-semibold">
        {t("ui.planTitle")}
      </h2>
      <p className="mt-2">
        <span className="font-medium">{tk(`ui.planName_${p.plan}`)}</span>
        {p.plan === "trial" && p.trialEndsAt ? (
          <span className="text-tinta-2"> · {t("ui.trialEnds", { date: fmtDate(p.trialEndsAt) })}</span>
        ) : null}
      </p>
      <dl className="num mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-tinta-2">{t("ui.planHectares")}</dt>
        <dd className={over(p.usage.ha, p.limits.maxHa) ? "font-medium text-peligro" : ""}>
          {fmtNum(p.usage.ha)} / {cap(p.limits.maxHa)}
        </dd>
        <dt className="text-tinta-2">{t("ui.planPeople")}</dt>
        <dd className={over(p.usage.users, p.limits.maxUsers) ? "font-medium text-peligro" : ""}>
          {fmtNum(p.usage.users)} / {cap(p.limits.maxUsers)}
        </dd>
      </dl>

      {p.pending ? (
        <div role="status" className="mt-4 border-l-2 border-trigo pl-3 text-sm">
          <p className="font-medium">{t("ui.planPending", { date: fmtDate(p.pending.createdAt) })}</p>
          <p className="text-tinta-2">{requested(p.pending)}</p>
          {p.pending.note && <p className="mt-1 text-tinta-2">“{p.pending.note}”</p>}
          <button
            type="button"
            className="mt-2 cursor-pointer font-medium text-accion underline underline-offset-4 disabled:opacity-50"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t("ui.planCancelRequest")}
          </button>
          {cancel.error && <ErrorBox error={cancel.error} />}
        </div>
      ) : (
        <>
          {p.lastResolved && (
            <p className="mt-4 text-sm text-tinta-2">
              {t(p.lastResolved.status === "approved" ? "ui.planLastApproved" : "ui.planLastRejected", {
                what: requested(p.lastResolved),
              })}
              {p.lastResolved.resolutionNote ? ` ${p.lastResolved.resolutionNote}` : ""}
            </p>
          )}
          {!open ? (
            <button
              type="button"
              className="mt-4 cursor-pointer text-sm font-medium text-accion underline underline-offset-4"
              onClick={() => setOpen(true)}
            >
              {t("ui.planAsk")}
            </button>
          ) : (
            <form
              className="mt-4 flex max-w-md flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <p className="text-sm text-tinta-2">
                {t("ui.planAskIntro", {
                  ha: cap(p.plans.active.maxHa),
                  users: cap(p.plans.active.maxUsers),
                })}
              </p>
              <Field label={t("ui.planAskHa")} hint={t("ui.planAskOptional")}>
                <Input
                  inputMode="decimal"
                  value={f.maxHa}
                  onChange={(e) => setF({ ...f, maxHa: e.target.value })}
                />
              </Field>
              <Field label={t("ui.planAskUsers")} hint={t("ui.planAskOptional")}>
                <Input
                  inputMode="numeric"
                  value={f.maxUsers}
                  onChange={(e) => setF({ ...f, maxUsers: e.target.value })}
                />
              </Field>
              <Field label={t("ui.planAskNote")} hint={t("ui.planAskOptional")}>
                <Input
                  value={f.note}
                  maxLength={LIMITS.planRequest.noteLength}
                  onChange={(e) => setF({ ...f, note: e.target.value })}
                />
              </Field>
              <p className="text-sm text-tinta-2">{t("ui.planAskNoCharge")}</p>
              {send.error && <ErrorBox error={send.error} />}
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={send.isPending}>
                  {t("ui.planAskSend")}
                </Button>
                <button
                  type="button"
                  className="cursor-pointer text-sm text-tinta-2 underline underline-offset-4 hover:text-surco"
                  onClick={() => setOpen(false)}
                >
                  {t("ui.cancel")}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
