import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { Button, ErrorBox, Skeleton, toast } from "./ui";

interface Status {
  active: boolean;
  createdAt: number | null;
  lastUsedAt: number | null;
}

/** I-04: enlace .ics con las tareas del usuario, para suscribirse desde Google Calendar u Outlook. */
export function CalendarFeed() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["calendar-feed"], queryFn: () => get<Status>("/me/calendar-feed") });
  const [url, setUrl] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["calendar-feed"] });
  const create = useMutation({
    mutationFn: () => post<{ url: string }>("/me/calendar-feed"),
    onSuccess: (r) => {
      setUrl(r.url);
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: () => del("/me/calendar-feed"),
    onSuccess: () => {
      setUrl(null);
      void refresh();
    },
  });
  const s = status.data;
  if (!s) return <Skeleton h={132} className="mt-8" />;
  return (
    <section id="calendario" className="mt-8 scroll-mt-4">
      <h2 className="font-serif text-xl font-semibold">{t("ui.calendarFeedTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t("ui.calendarFeedIntro")}</p>

      {url && (
        <div role="status" className="mt-4 border-l-2 border-trigo pl-3">
          <p className="font-medium">{t("ui.calendarFeedNew")}</p>
          <p className="mt-1 text-sm text-tinta-2">{t("ui.calendarFeedNewText")}</p>
          <code className="mt-2 block font-mono text-sm break-all">{url}</code>
          <Button
            className="mt-2"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              toast(t("ui.copied"));
            }}
          >
            {t("ui.calendarFeedCopy")}
          </Button>
          <p className="mt-3 text-sm text-tinta-2">{t("ui.calendarFeedGoogle")}</p>
          <p className="text-sm text-tinta-2">{t("ui.calendarFeedOutlook")}</p>
        </div>
      )}

      <p className="mt-4 text-sm">
        {s.active && s.createdAt ? t("ui.calendarFeedActive", { date: fmtDateTime(s.createdAt) }) : t("ui.calendarFeedNone")}{" "}
        {s.active && (s.lastUsedAt ? t("ui.calendarFeedUsed", { date: fmtDateTime(s.lastUsedAt) }) : t("ui.calendarFeedNeverUsed"))}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <Button variant={s.active ? "secondary" : "primary"} disabled={create.isPending} onClick={() => create.mutate()}>
          {t(s.active ? "ui.calendarFeedRegen" : "ui.calendarFeedCreate")}
        </Button>
        {s.active && (
          <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {t("ui.calendarFeedRevoke")}
          </Button>
        )}
      </div>
      {[create.error, revoke.error].map((e, i) => (e ? <ErrorBox key={i} error={e} /> : null))}
    </section>
  );
}
