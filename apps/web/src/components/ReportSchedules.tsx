import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Field, Input, Select, toast } from "./ui";

interface Schedule {
  id: string;
  farmId: string | null;
  name: string;
  email: string;
  frequency: "weekly" | "monthly";
  lastSentAt: number | null;
}

/** R-10: a quién le llega el parte semanal con PDF (socio, agrónomo, banco), cada semana o el primer lunes del mes. */
export function ReportSchedules({ farmId }: { farmId: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["report-schedules"], queryFn: () => get<Schedule[]>("/org/report-schedules") });
  const [f, setF] = useState({ name: "", email: "", frequency: "weekly", scope: "farm" });
  const add = useMutation({
    mutationFn: () =>
      post("/org/report-schedules", {
        name: f.name,
        email: f.email,
        frequency: f.frequency,
        farmId: f.scope === "farm" ? farmId : null,
      }),
    onSuccess: () => {
      setF({ ...f, name: "", email: "" });
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast(t("ui.scheduleAdded"));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/report-schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-schedules"] }),
  });
  return (
    <section>
      <h2 className="font-serif text-xl font-semibold">{t("ui.scheduleTitle")}</h2>
      <p className="mt-1 text-sm text-tinta-2">{t("ui.scheduleIntro")}</p>
      {list.error && <ErrorBox error={list.error} />}
      <ul className="mt-2 flex flex-col divide-y divide-linea text-sm">
        {list.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="flex-1">
              <strong>{r.name}</strong> · {r.email} · {tk(`ui.scheduleFreq_${r.frequency}`)} ·{" "}
              {r.farmId ? t("ui.scheduleThisFarm") : t("ui.scheduleAllFarms")}
              {r.lastSentAt ? ` · ${t("ui.scheduleLast", { date: fmtDate(r.lastSentAt) })}` : ""}
            </span>
            <Button variant="danger" onClick={() => remove.mutate(r.id)}>
              {t("ui.delete")}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label={t("ui.scheduleName")}>
          <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t("auth.emailLabel")}>
          <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label={t("ui.scheduleFrequency")}>
          <Select
            value={f.frequency}
            onChange={(e) => setF({ ...f, frequency: e.target.value })}
            options={(["weekly", "monthly"] as const).map((v) => ({ value: v, label: tk(`ui.scheduleFreq_${v}`) }))}
          />
        </Field>
        <Field label={t("ui.scheduleScope")}>
          <Select
            value={f.scope}
            onChange={(e) => setF({ ...f, scope: e.target.value })}
            options={[
              { value: "farm", label: t("ui.scheduleThisFarm") },
              { value: "all", label: t("ui.scheduleAllFarms") },
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" disabled={add.isPending}>
            {t("ui.scheduleAdd")}
          </Button>
        </div>
        {add.error && <ErrorBox error={add.error} />}
      </form>
    </section>
  );
}
