import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { Button, ErrorBox, SectionHead, Skeleton, toast } from "./ui";

interface Status {
  active: boolean;
  createdAt: number | null;
  lastUsedAt: number | null;
}

/** Enlace .ics con las tareas del usuario, para suscribirse desde Google Calendar u Outlook. */
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
  if (!s) return <Skeleton h={132} />;
  return (
    <section id="calendario" className="scroll-mt-4">
      <SectionHead title={t("ui.calendar.feedTitle")} />
      <p className="mt-3 text-tinta-2">{t("ui.calendar.feedIntro")}</p>

      {url && (
        <div role="status" className="mt-4 border-l-2 border-trigo pl-3">
          <p className="font-medium">{t("ui.calendar.feedNew")}</p>
          <p className="mt-1 text-sm text-tinta-2">{t("ui.calendar.feedNewText")}</p>
          <code className="mt-2 block font-mono text-sm break-all">{url}</code>
          <Button
            className="mt-2"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              toast(t("ui.common.copied"));
            }}
          >
            {t("ui.calendar.feedCopy")}
          </Button>
          <p className="mt-3 text-sm text-tinta-2">{t("ui.calendar.feedGoogle")}</p>
          <p className="text-sm text-tinta-2">{t("ui.calendar.feedOutlook")}</p>
        </div>
      )}

      <p className="mt-4 text-sm">
        {s.active && s.createdAt ? t("ui.calendar.feedActive", { date: fmtDateTime(s.createdAt) }) : t("ui.calendar.feedNone")}{" "}
        {s.active && (s.lastUsedAt ? t("ui.calendar.feedUsed", { date: fmtDateTime(s.lastUsedAt) }) : t("ui.calendar.feedNeverUsed"))}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <Button variant={s.active ? "secondary" : "primary"} disabled={create.isPending} onClick={() => create.mutate()}>
          {t(s.active ? "ui.calendar.feedRegen" : "ui.calendar.feedCreate")}
        </Button>
        {s.active && (
          <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {t("ui.calendar.feedRevoke")}
          </Button>
        )}
      </div>
      {[create.error, revoke.error].map((e, i) => (e ? <ErrorBox key={i} error={e} /> : null))}
    </section>
  );
}
