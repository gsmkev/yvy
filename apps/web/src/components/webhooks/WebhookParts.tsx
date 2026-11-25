/** Piezas de la sección de webhooks: aviso del secreto, tabla y formulario de alta. */
import { WEBHOOK_EVENTS } from "@yvy/shared";
import { fmtDateTime } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { Button, DataTable, ErrorBox, Field, Form, Input, toast, type Column } from "../ui";
import type { Hook, WebhooksState } from "./useWebhooks";

const eventName = (e: string) => tk(`ui.webhooks.event_${e.replace(".", "_")}`);

/** El secreto se muestra una sola vez al crear el webhook. */
export function SecretNotice({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
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
        <Button variant="primary" onClick={onDone}>
          {t("ui.totp.recoverySaved")}
        </Button>
      </div>
    </div>
  );
}

function stateText(h: Hook) {
  if (!h.enabled) return h.consecutiveFailures > 0 ? t("ui.webhooks.paused") : t("ui.webhooks.pausedByYou");
  if (!h.lastAttemptAt) return t("ui.webhooks.neverSent");
  const date = fmtDateTime(h.lastAttemptAt);
  return h.lastStatus === "ok" ? t("ui.webhooks.ok", { date }) : t("ui.webhooks.fail", { error: h.lastError ?? "?", date });
}

function hookColumns(w: WebhooksState): Column<Hook>[] {
  return [
    {
      id: "url",
      header: t("ui.webhooks.url"),
      cell: (h) => (
        <div className="min-w-0 max-w-[16rem] py-1 sm:max-w-xs">
          <p className="truncate font-medium" title={h.url}>
            {h.url}
          </p>
          <p className={`text-xs font-normal ${h.lastStatus === "error" || (!h.enabled && h.consecutiveFailures > 0) ? "text-peligro" : "text-tinta-2"}`}>{stateText(h)}</p>
        </div>
      ),
    },
    { id: "events", header: t("ui.webhooks.events"), hideBelow: "lg", cell: (h) => <span className="text-tinta-2">{h.events.map(eventName).join(", ")}</span> },
    {
      id: "actions",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      cell: (h) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="quiet" onClick={() => w.test.mutate(h.id)}>
            {t("ui.webhooks.test")}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => w.toggle.mutate(h)}>
            {t(h.enabled ? "ui.webhooks.pause" : "ui.webhooks.resume")}
          </Button>
          <Button size="sm" variant="quiet" className="text-peligro" onClick={() => w.remove.mutate(h.id)}>
            {t("ui.webhooks.delete")}
          </Button>
        </div>
      ),
    },
  ];
}

/** Webhooks cargados con su estado y las acciones de cada uno. */
export function HooksTable({ w, rows }: { w: WebhooksState; rows: Hook[] }) {
  return (
    <div className="mt-4">
      <DataTable caption={t("ui.webhooks.title")} rows={rows} rowKey={(h) => h.id} columns={hookColumns(w)} />
    </div>
  );
}

/** Alta de un webhook: dirección y eventos que se envían. */
export function NewHookForm({ w }: { w: WebhooksState }) {
  const { url, setUrl, events, setEvents, add } = w;
  return (
    <Form className="mt-4 flex max-w-lg flex-col gap-3" onSubmit={() => add.mutate()}>
      <Field label={t("ui.webhooks.url")}>
        <Input type="url" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <fieldset>
        <legend className="text-sm font-medium">{t("ui.webhooks.events")}</legend>
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="flex cursor-pointer items-center gap-2 text-body">
              <input type="checkbox" className="accent-accion" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
              {eventName(ev)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" className="self-start" disabled={add.isPending || events.length === 0 || !url.trim()}>
        {t("ui.webhooks.add")}
      </Button>
      {[add.error, w.toggle.error, w.remove.error, w.test.error].map((e, i) => (e ? <ErrorBox key={i} error={e} /> : null))}
    </Form>
  );
}
