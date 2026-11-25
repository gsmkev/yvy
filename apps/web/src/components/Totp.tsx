/** Segundo factor propio. Alta con QR (otpauth://), códigos de recuperación y baja. Con `forced` (el dueño lo exige a los administradores) no hay baja y es lo único que se ve hasta completar el alta. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, put } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, ErrorBox, SectionHead, Skeleton, toast } from "./ui";
import { ConfirmForm, RecoveryCodes, SetupForm } from "./totp/TotpForms";
import { useTotp, type TotpState, type TotpStatus } from "./totp/useTotp";

/** Estado con el segundo factor activo: cuántos códigos quedan y cómo regenerarlos o darlo de baja. */
function EnabledPanel({ s, totp, locked }: { s: TotpStatus; totp: TotpState; locked: boolean }) {
  const { action, setAction } = totp;
  return (
    <div className="mt-4">
      <p role="status" className="border-l-2 border-soja pl-3">
        {t("ui.totp.on", { n: s.recoveryLeft })}
      </p>
      {action ? (
        <ConfirmForm action={action} totp={totp} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <button type="button" className="cursor-pointer font-medium text-accion underline underline-offset-4" onClick={() => setAction("regen")}>
            {t("ui.totp.regen")}
          </button>
          {!locked && (
            <button type="button" className="cursor-pointer font-medium text-peligro underline underline-offset-4" onClick={() => setAction("disable")}>
              {t("ui.totp.disable")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Segundo factor propio. Alta con QR (otpauth://), códigos de recuperación y baja. Con `forced` (el dueño lo exige
 * a los administradores) no hay baja y es lo único que se ve hasta completar el alta.
 */
export function TotpSection({ forced = false }: { forced?: boolean }) {
  const totp = useTotp();
  const { status: s, setup, fresh, setFresh, start } = totp;
  if (!s) return <Skeleton h={168} />;
  const locked = forced || s.requiredByOrg;
  return (
    <section id="segundo-factor" className="scroll-mt-4">
      <SectionHead title={t("ui.totp.title")} />
      <p className="mt-3 text-tinta-2">{t(locked ? "ui.totp.introRequired" : "ui.totp.intro")}</p>
      {fresh && <RecoveryCodes codes={fresh} onDone={() => setFresh(null)} />}
      {!fresh && !s.enabled && !setup && (
        <Button variant="primary" className="mt-4" disabled={start.isPending} onClick={() => start.mutate()}>
          {t("ui.totp.activate")}
        </Button>
      )}
      {!s.enabled && setup && <SetupForm setup={setup} totp={totp} />}
      {s.enabled && !fresh && <EnabledPanel s={s} totp={totp} locked={locked} />}
    </section>
  );
}

interface Security {
  requireAdminTotp: boolean;
  admins: { userId: string; fullName: string; totp: boolean }[];
}

/** El dueño exige el segundo factor a los administradores y ve quién ya lo activó. */
export function AdminTotpPolicy() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["org-security"], queryFn: () => get<Security>("/org/security") });
  const set = useMutation({
    mutationFn: (v: boolean) => put("/org/security", { requireAdminTotp: v }),
    onSuccess: () => {
      toast(t("ui.toast.totpPolicy"));
      return qc.invalidateQueries({ queryKey: ["org-security"] });
    },
  });
  if (!q.data) return <Skeleton h={64} />;
  return (
    <section>
      <SectionHead title={t("ui.totp.policyTitle")} />
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-body">
        <input
          type="checkbox"
          className="mt-1 accent-accion"
          checked={q.data.requireAdminTotp}
          disabled={set.isPending}
          onChange={(e) => set.mutate(e.target.checked)}
        />
        <span>{t("ui.totp.policyLabel")}</span>
      </label>
      {q.data.admins.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-2">{t("ui.totp.policyNoAdmins")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-linea border-y border-linea text-sm">
          {q.data.admins.map((a) => (
            <li key={a.userId} className="flex justify-between gap-3 py-2">
              <span>{a.fullName}</span>
              <span className={a.totp ? "text-soja" : "text-tinta-2"}>{t(a.totp ? "ui.totp.policyOn" : "ui.totp.policyOff")}</span>
            </li>
          ))}
        </ul>
      )}
      {set.error ? <ErrorBox error={set.error} /> : null}
    </section>
  );
}
