/** Pedido de cambio de plan: el que está pendiente y el formulario para hacer uno nuevo. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LIMITS, type Billing, type PlanRequestRow as PlanRequest, type PlanView } from "@yvy/shared";
import { del, post } from "../../lib/api";
import { fmtDate, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { Button, ErrorBox, Field, Form, Input, toast } from "../ui";

/** "Plan activo, hasta 500 ha, hasta 5 personas" de un pedido. */
const requestedText = (r: PlanRequest) =>
  [tk(`ui.plan.name_${r.plan}`), r.maxHa ? t("ui.plan.upToHa", { n: fmtNum(r.maxHa) }) : null, r.maxUsers ? t("ui.plan.upToUsers", { n: fmtNum(r.maxUsers) }) : null]
    .filter(Boolean)
    .join(", ");

const cap = (n: number | null) => (n === null ? t("ui.plan.noCap") : fmtNum(n));

/** Pedido que espera la respuesta del equipo, con la opción de cancelarlo. */
export function PendingRequest({ pending }: { pending: NonNullable<PlanView["pending"]> }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => del("/org/plan-request"),
    onSuccess: () => {
      toast(t("ui.plan.requestCancelled"));
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
  return (
    <div role="status" className="mt-4 border-l-2 border-trigo pl-3 text-sm">
      <p className="font-medium">{t("ui.plan.pending", { date: fmtDate(pending.createdAt) })}</p>
      <p className="text-tinta-2">{requestedText(pending)}</p>
      {pending.note && <p className="mt-1 text-tinta-2">“{pending.note}”</p>}
      <button type="button" className="mt-2 cursor-pointer font-medium text-accion underline underline-offset-4 disabled:opacity-50" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
        {t("ui.plan.cancelRequest")}
      </button>
      {cancel.error && <ErrorBox error={cancel.error} />}
    </div>
  );
}

/** Cómo terminó el último pedido. */
export function LastResolved({ r }: { r: NonNullable<PlanView["lastResolved"]> }) {
  return (
    <p className="mt-4 text-sm text-tinta-2">
      {t(r.status === "approved" ? "ui.plan.lastApproved" : "ui.plan.lastRejected", { what: requestedText(r) })}
      {r.resolutionNote ? ` ${r.resolutionNote}` : ""}
    </p>
  );
}

/** Formulario del pedido: topes que se piden y una nota. No cobra. */
export function AskForm({ plan, billing, onClose }: { plan: PlanView; billing: Billing; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ maxHa: "", maxUsers: "", note: "" });
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
      onClose();
      toast(t("ui.plan.requestSent"));
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
  return (
    <Form className="mt-4 flex max-w-md flex-col gap-3" onSubmit={() => send.mutate()}>
      <p className="text-sm text-tinta-2">{t("ui.plan.askIntro", { ha: cap(plan.plans.active.maxHa), users: cap(plan.plans.active.maxUsers) })}</p>
      <Field label={t("ui.plan.askHa")} hint={t("ui.plan.askOptional")}>
        <Input inputMode="decimal" value={f.maxHa} onChange={(e) => setF({ ...f, maxHa: e.target.value })} />
      </Field>
      <Field label={t("ui.plan.askUsers")} hint={t("ui.plan.askOptional")}>
        <Input inputMode="numeric" value={f.maxUsers} onChange={(e) => setF({ ...f, maxUsers: e.target.value })} />
      </Field>
      <Field label={t("ui.plan.askNote")} hint={t("ui.plan.askOptional")}>
        <Input value={f.note} maxLength={LIMITS.planRequest.noteLength} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
      <p className="text-sm text-tinta-2">{t("ui.plan.askNoCharge")}</p>
      {send.error && <ErrorBox error={send.error} />}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={send.isPending}>
          {t("ui.plan.askSend")}
        </Button>
        <button type="button" className="cursor-pointer text-sm text-tinta-2 underline underline-offset-4 hover:text-surco" onClick={onClose}>
          {t("ui.common.cancel")}
        </button>
      </div>
    </Form>
  );
}
