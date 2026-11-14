import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs as Prefs, type NotifyKind } from "@yvy/shared";
import { get, put } from "../lib/api";
import { t, tk } from "../lib/i18n";
import { Button, ErrorBox, Input, Spinner, toast } from "./ui";

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
      toast(t("ui.notifSaved"));
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
      <h2 className="text-[18px] leading-6 font-semibold">{t("ui.notifTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t("ui.notifIntro")}</p>
      {!email && kinds.length < 5 && <p className="mt-2 text-sm text-tinta-2">{t("ui.notifWorkerNote")}</p>}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-tinta-2">
          <tr>
            <th className="py-2 font-medium">{t("ui.notifKind")}</th>
            <th className="py-2 font-medium">{t("ui.notifPush")}</th>
            {email && <th className="py-2 font-medium">{t("ui.notifEmail")}</th>}
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) => (
            <tr key={k} className="border-t border-linea">
              <td className="py-2.5">{tk(`ui.notifKind_${k}`)}</td>
              {(email ? (["push", "email"] as const) : (["push"] as const)).map((ch) => (
                <td key={ch} className="py-2.5">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-[#7A9A3F]"
                    aria-label={`${tk(`ui.notifKind_${k}`)}: ${ch === "push" ? t("ui.notifPush") : t("ui.notifEmail")}`}
                    checked={prefs.kinds[k][ch]}
                    onChange={(e) => setChannel(k, ch, e.target.checked)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 font-semibold">{t("ui.notifQuietTitle")}</h3>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-[#7A9A3F]"
          checked={prefs.quiet.enabled}
          onChange={(e) => setQuiet({ enabled: e.target.checked })}
        />
        {t("ui.notifQuietSwitch")}
      </label>
      {prefs.quiet.enabled && (
        <div className="mt-3 flex items-end gap-3 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t("ui.notifQuietFrom")}</span>
            <Input type="time" required value={prefs.quiet.start} onChange={(e) => setQuiet({ start: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t("ui.notifQuietTo")}</span>
            <Input type="time" required value={prefs.quiet.end} onChange={(e) => setQuiet({ end: e.target.value })} />
          </label>
        </div>
      )}
      <p className="mt-2 text-xs text-tinta-2">{t("ui.notifQuietHint")}</p>
      {save.error && (
        <div className="mt-3">
          <ErrorBox error={save.error} />
        </div>
      )}
      <Button className="mt-4" variant="primary" disabled={save.isPending || badQuiet} onClick={() => save.mutate()}>
        {t("ui.notifSave")}
      </Button>
    </section>
  );
}
