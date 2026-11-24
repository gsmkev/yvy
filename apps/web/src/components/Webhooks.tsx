import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@yvy/shared";
import { del, get, patch, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Button, DataTable, EmptyState, ErrorBox, Field, Form, Input, SectionHead, toast } from "./ui";

interface Hook {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus: "ok" | "error" | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  lastAttemptAt: number | null;
  consecutiveFailures: number;
}

/** URLs que reciben un POST firmado con cada aviso o registro nuevo. Solo dueño y administrador. */
export function WebhooksPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["webhooks"], queryFn: () => get<Hook[]>("/org/webhooks") });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["webhooks"] });
  const add = useMutation({
    mutationFn: () => post<{ secret: string }>("/org/webhooks", { url: url.trim(), events }),
    onSuccess: (r) => {
      setSecret(r.secret);
      setUrl("");
      void refresh();
    },
  });
  const toggle = useMutation({ mutationFn: (h: Hook) => patch(`/org/webhooks/${h.id}`, { enabled: !h.enabled }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => del(`/org/webhooks/${id}`), onSuccess: refresh });
  const test = useMutation({
    mutationFn: (id: string) => post(`/org/webhooks/${id}/test`),
    // la entrega pasa por la cola: el estado aparece al recargar la lista unos segundos después
    onSuccess: () => setTimeout(() => void refresh(), 4000),
  });
  const rows = list.data ?? [];

  const state = (h: Hook) => {
    if (!h.enabled) return h.consecutiveFailures > 0 ? t("ui.webhooks.paused") : t("ui.webhooks.pausedByYou");
    if (!h.lastAttemptAt) return t("ui.webhooks.neverSent");
    return h.lastStatus === "ok"
      ? t("ui.webhooks.ok", { date: fmtDateTime(h.lastAttemptAt) })
      : t("ui.webhooks.fail", { error: h.lastError ?? "?", date: fmtDateTime(h.lastAttemptAt) });
  };

  return (
    <section id="webhooks" className="scroll-mt-4">
      <SectionHead title={t("ui.webhooks.title")} />
      <p className="mt-3 text-tinta-2">{t("ui.webhooks.intro")}</p>

      {secret && (
        <div role="status" className="mt-4 border-l-2 border-trigo pl-3">
          <p className="font-medium">{t("ui.webhooks.secretTitle")}</p>
          <p className="mt-1 text-sm text-tinta-2">{t("ui.webhooks.secretText")}</p>
          <code className="mt-2 block font-mono text-body break-all">{secret}</code>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(secret);
                toast(t("ui.common.copied"));
              }}
            >
              {t("ui.totp.recoveryCopy")}
            </Button>
            <Button variant="primary" onClick={() => setSecret(null)}>
              {t("ui.totp.recoverySaved")}
            </Button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <DataTable
            caption={t("ui.webhooks.title")}
            rows={rows}
            rowKey={(h) => h.id}
            columns={[
              {
                id: "url",
                header: t("ui.webhooks.url"),
                cell: (h) => (
                  <div className="min-w-0 max-w-[16rem] py-1 sm:max-w-xs">
                    <p className="truncate font-medium" title={h.url}>
                      {h.url}
                    </p>
                    <p className={`text-xs font-normal ${h.lastStatus === "error" || (!h.enabled && h.consecutiveFailures > 0) ? "text-peligro" : "text-tinta-2"}`}>{state(h)}</p>
                  </div>
                ),
              },
              {
                id: "events",
                header: t("ui.webhooks.events"),
                hideBelow: "lg",
                cell: (h) => <span className="text-tinta-2">{h.events.map((e) => tk(`ui.webhooks.event_${e.replace(".", "_")}`)).join(" · ")}</span>,
              },
              {
                id: "actions",
                header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
                cell: (h) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="quiet" onClick={() => test.mutate(h.id)}>
                      {t("ui.webhooks.test")}
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => toggle.mutate(h)}>
                      {t(h.enabled ? "ui.webhooks.pause" : "ui.webhooks.resume")}
                    </Button>
                    <Button size="sm" variant="quiet" className="text-peligro" onClick={() => remove.mutate(h.id)}>
                      {t("ui.webhooks.delete")}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
      {list.isSuccess && rows.length === 0 && <EmptyState compact title={t("ui.webhooks.empty")} />}

      <Form className="mt-4 flex max-w-lg flex-col gap-3" onSubmit={() => add.mutate()}>
        <Field label={t("ui.webhooks.url")}>
          <Input type="url" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium">{t("ui.webhooks.events")}</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-2 text-body">
                <input
                  type="checkbox"
                  className="accent-accion"
                  checked={events.includes(ev)}
                  onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))}
                />
                {tk(`ui.webhooks.event_${ev.replace(".", "_")}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="primary" className="self-start" disabled={add.isPending || events.length === 0 || !url.trim()}>
          {t("ui.webhooks.add")}
        </Button>
        {[add.error, toggle.error, remove.error, test.error].map((e, i) => (e ? <ErrorBox key={i} error={e} /> : null))}
      </Form>
    </section>
  );
}
