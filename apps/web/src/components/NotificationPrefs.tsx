import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs as Prefs, type NotifyKind } from "@yvy/shared";
import { get, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { Button, DataTable, ErrorBox, Input, SectionHead, Spinner, toast } from "./ui";

interface Resp {
  prefs: Prefs;
  kinds: NotifyKind[];
  email: boolean;
}

/** U-29: qué avisos llegan por celular y por email, y el horario de silencio del push. */
export function NotificationPrefs() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notification-prefs"], queryFn: () => get<Resp>("/me/notification-prefs") });
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_NOTIFICATION_PREFS);
  useEffect(() => {
    if (q.data) setPrefs(q.data.prefs);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => put<Resp>("/me/notification-prefs", prefs),
    onSuccess: (r) => {
      qc.setQueryData(["notification-prefs"], r);
      toast(t("ui.notif.saved"));
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { kinds, email } = q.data!;
  const setChannel = (k: NotifyKind, ch: "push" | "email", v: boolean) =>
    setPrefs({ ...prefs, kinds: { ...prefs.kinds, [k]: { ...prefs.kinds[k], [ch]: v } } });
  const setQuiet = (patch: Partial<Prefs["quiet"]>) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, ...patch } });
  const badQuiet = prefs.quiet.enabled && prefs.quiet.start === prefs.quiet.end;

  return (
    <section>
      <SectionHead title={t("ui.notif.title")} />
      <p className="mt-3 text-tinta-2">{t("ui.notif.intro")}</p>
      {!email && kinds.length < 5 && <p className="mt-2 text-sm text-tinta-2">{t("ui.notif.workerNote")}</p>}
      <div className="mt-3">
        <DataTable
          caption={t("ui.notif.title")}
          rows={kinds}
          rowKey={(k) => k}
          columns={[
            { id: "kind", header: t("ui.notif.kind"), cell: (k) => <span className="font-normal">{tk(`ui.notif.kind_${k}`)}</span> },
            ...(email ? (["push", "email"] as const) : (["push"] as const)).map((ch) => ({
              id: ch,
              header: ch === "push" ? t("ui.notif.push") : t("ui.notif.email"),
              width: "5.5rem",
              cell: (k: NotifyKind) => (
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-[#7A9A3F]"
                  aria-label={`${tk(`ui.notif.kind_${k}`)}: ${ch === "push" ? t("ui.notif.push") : t("ui.notif.email")}`}
                  checked={prefs.kinds[k][ch]}
                  onChange={(e) => setChannel(k, ch, e.target.checked)}
                />
              ),
            })),
          ]}
        />
      </div>

      <div className="mt-8"><SectionHead title={t("ui.notif.quietTitle")} /></div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-[#7A9A3F]"
          checked={prefs.quiet.enabled}
          onChange={(e) => setQuiet({ enabled: e.target.checked })}
        />
        {t("ui.notif.quietSwitch")}
      </label>
      {prefs.quiet.enabled && (
        <div className="mt-3 flex items-end gap-3 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t("ui.notif.quietFrom")}</span>
            <Input type="time" required value={prefs.quiet.start} onChange={(e) => setQuiet({ start: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t("ui.notif.quietTo")}</span>
            <Input type="time" required value={prefs.quiet.end} onChange={(e) => setQuiet({ end: e.target.value })} />
          </label>
        </div>
      )}
      <p className="mt-2 text-xs text-tinta-2">{t("ui.notif.quietHint")}</p>
      {save.error && (
        <div className="mt-3">
          <ErrorBox error={save.error} />
        </div>
      )}
      <Button className="mt-4" variant="primary" disabled={save.isPending || badQuiet} onClick={() => save.mutate()}>
        {t("ui.notif.save")}
      </Button>
    </section>
  );
}
