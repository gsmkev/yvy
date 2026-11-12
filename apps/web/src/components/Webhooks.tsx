import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@yvy/shared";
import { del, get, patch, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Field, Input, toast } from "./ui";

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

/** I-02: URLs que reciben un POST firmado con cada aviso o registro nuevo. Solo dueño y administrador. */
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
    if (!h.enabled) return h.consecutiveFailures > 0 ? t("ui.webhooksPaused") : t("ui.webhooksPausedByYou");
    if (!h.lastAttemptAt) return t("ui.webhooksNeverSent");
    return h.lastStatus === "ok"
      ? t("ui.webhooksOk", { date: fmtDateTime(h.lastAttemptAt) })
      : t("ui.webhooksFail", { error: h.lastError ?? "?", date: fmtDateTime(h.lastAttemptAt) });
  };

  return (
    <section id="webhooks" className="mt-8 scroll-mt-4">
      <h2 className="font-serif text-xl font-semibold">{t("ui.webhooksTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t("ui.webhooksIntro")}</p>

      {secret && (
        <div role="status" className="mt-4 border-l-2 border-trigo pl-3">
          <p className="font-medium">{t("ui.webhooksSecretTitle")}</p>
          <p className="mt-1 text-sm text-tinta-2">{t("ui.webhooksSecretText")}</p>
          <code className="mt-2 block font-mono text-[15px] break-all">{secret}</code>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(secret);
                toast(t("ui.copied"));
              }}
            >
              {t("ui.totpRecoveryCopy")}
            </Button>
            <Button variant="primary" onClick={() => setSecret(null)}>
              {t("ui.totpRecoverySaved")}
            </Button>
          </div>
        </div>
      )}

      {list.isSuccess && rows.length === 0 && <p className="mt-4 text-sm text-tinta-2">{t("ui.webhooksEmpty")}</p>}
      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-linea border-y border-linea text-sm">
          {rows.map((h) => (
            <li key={h.id} className="py-3">
              <p className="font-medium break-all">{h.url}</p>
              <p className="mt-0.5 text-tinta-2">{h.events.map((e) => tk(`ui.webhooksEvent_${e.replace(".", "_")}`)).join(" · ")}</p>
              <p className={`mt-0.5 ${h.lastStatus === "error" || (!h.enabled && h.consecutiveFailures > 0) ? "text-peligro" : "text-tinta-2"}`}>{state(h)}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                <button type="button" className="cursor-pointer font-medium text-accion underline underline-offset-4" onClick={() => test.mutate(h.id)}>
                  {t("ui.webhooksTest")}
                </button>
                <button type="button" className="cursor-pointer font-medium text-accion underline underline-offset-4" onClick={() => toggle.mutate(h)}>
                  {t(h.enabled ? "ui.webhooksPause" : "ui.webhooksResume")}
                </button>
                <button type="button" className="cursor-pointer font-medium text-peligro underline underline-offset-4" onClick={() => remove.mutate(h.id)}>
                  {t("ui.webhooksDelete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 flex max-w-lg flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label={t("ui.webhooksUrl")}>
          <Input type="url" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium">{t("ui.webhooksEvents")}</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  className="accent-accion"
                  checked={events.includes(ev)}
                  onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))}
                />
                {tk(`ui.webhooksEvent_${ev.replace(".", "_")}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="primary" className="self-start" disabled={add.isPending || events.length === 0 || !url.trim()}>
          {t("ui.webhooksAdd")}
        </Button>
        {[add.error, toggle.error, remove.error, test.error].map((e, i) => (e ? <ErrorBox key={i} error={e} /> : null))}
      </form>
    </section>
  );
}
