/** A quién le llega el parte semanal con PDF (socio, agrónomo, banco), cada semana o el primer lunes del mes. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDate } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Field, Form, Input, Select, toast } from "./ui";

interface Schedule {
  id: string;
  farmId: string | null;
  name: string;
  email: string;
  frequency: "weekly" | "monthly";
  lastSentAt: number | null;
}

/** A quién le llega el parte semanal con PDF (socio, agrónomo, banco), cada semana o el primer lunes del mes. */
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
      toast(t("ui.schedule.added"));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/report-schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-schedules"] }),
  });
  return (
    <section>
      <p className="mt-2 text-sm text-tinta-2">{t("ui.schedule.intro")}</p>
      {list.error && <ErrorBox error={list.error} />}
      <ul className="mt-2 flex flex-col divide-y divide-linea text-sm">
        {list.data?.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-2 py-2.5">
            <span className="min-w-0">
              <strong className="block truncate font-medium">{r.name}</strong>
              <span className="block truncate text-tinta-2">{r.email}</span>
              <span className="block text-meta text-tinta-2">
                {tk(`ui.schedule.freq_${r.frequency}`)} ·{" "}
                {r.farmId ? t("ui.schedule.thisFarm") : t("ui.schedule.allFarms")}
                {r.lastSentAt ? " · " + t("ui.schedule.last", { date: fmtDate(r.lastSentAt) }) : ""}
              </span>
            </span>
            <Button size="sm" variant="danger" onClick={() => remove.mutate(r.id)}>
              {t("ui.common.delete")}
            </Button>
          </li>
        ))}
      </ul>
      <Form className="mt-3 grid gap-3" onSubmit={() => add.mutate()}>
        <Field label={t("ui.schedule.name")}>
          <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t("auth.email.label")}>
          <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label={t("ui.schedule.frequency")}>
          <Select
            value={f.frequency}
            onChange={(e) => setF({ ...f, frequency: e.target.value })}
            options={(["weekly", "monthly"] as const).map((v) => ({ value: v, label: tk(`ui.schedule.freq_${v}`) }))}
          />
        </Field>
        <Field label={t("ui.schedule.scope")}>
          <Select
            value={f.scope}
            onChange={(e) => setF({ ...f, scope: e.target.value })}
            options={[
              { value: "farm", label: t("ui.schedule.thisFarm") },
              { value: "all", label: t("ui.schedule.allFarms") },
            ]}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={add.isPending}>
            {t("ui.schedule.add")}
          </Button>
        </div>
        {add.error && <ErrorBox error={add.error} />}
      </Form>
    </section>
  );
}
