import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { NotificationPrefs } from "../../components/NotificationPrefs";
import { CalendarFeed } from "../../components/CalendarFeed";
import { WebhooksPanel } from "../../components/Webhooks";
import { Preferences } from "../../components/Preferences";
import { PlanPanel } from "../../components/PlanPanel";
import { AdminTotpPolicy, TotpSection } from "../../components/Totp";
import { ConfirmModal, Spinner, toast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useMe } from "../../lib/queries";

/** V-05: código personal de referido del agrónomo y el enlace de registro que lo lleva. */
function Referral() {
  const q = useQuery({ queryKey: ["referral"], queryFn: () => get<{ code: string | null; referred: number; credited: number }>("/me/referral") });
  const [copied, setCopied] = useState(false);
  const me = useMe();
  const code = q.data?.code;
  if (!code) return null;
  const link = `${window.location.origin}/ingresar?modo=registro&ref=${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sin permiso de portapapeles: el enlace queda a la vista para copiarlo a mano
    }
  };
  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl font-semibold">{t(me.data?.role === "owner" ? "ui.accountReferralTitleProducer" : "ui.accountReferralTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t(me.data?.role === "owner" ? "ui.accountReferralTextProducer" : "ui.accountReferralText")}</p>
      <p className="mt-4 text-sm text-tinta-2">{t("ui.accountReferralCode")}</p>
      <p className="num font-serif text-2xl font-semibold tracking-wider">{code}</p>
      {(q.data?.referred ?? 0) > 0 && (
        <p className="mt-2 text-sm">{t("ui.accountReferralCount", { n: q.data!.referred, c: q.data!.credited })}</p>
      )}
      <p className="mt-3 text-sm text-tinta-2">{t("ui.accountReferralLink")}</p>
      <p className="text-sm break-all">{link}</p>
      <button
        type="button"
        className="mt-2 cursor-pointer text-sm font-medium text-accion underline underline-offset-4"
        onClick={() => void copy()}
        aria-live="polite"
      >
        {copied ? t("ui.copied") : t("ui.accountReferralCopy")}
      </button>
    </section>
  );
}

/** Cuenta (solo dueño): por ahora, el pedido de baja (P-09). No borra nada. */
export function AccountPage() {
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const request = useMutation({
    mutationFn: () => post("/org/delete-request"),
    onSuccess: () => {
      setConfirming(false);
      toast(t("ui.toastDeleteRequested"));
    },
  });

  if (me.isLoading)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="text-[28px] leading-tight">{t("ui.accountTitle")}</h1>
      <Preferences />
      <NotificationPrefs />
      <Referral />
      <CalendarFeed />
      {me.data && !isFieldRole(me.data.role) && <TotpSection />}
      {me.data?.role === "owner" && <AdminTotpPolicy />}
      {(me.data?.role === "owner" || me.data?.role === "admin") && <WebhooksPanel />}
      {me.data?.role === "owner" && <PlanPanel />}
      {me.data?.role !== "owner" ? null : (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold">{t("ui.accountDeleteTitle")}</h2>
          <p className="mt-2 text-tinta-2">{t("ui.accountDeleteText")}</p>
          {request.isSuccess ? (
            <p role="status" className="mt-4 border-l-2 border-soja pl-3">
              {t("ui.accountDeleteSent")}
            </p>
          ) : (
            <button
              type="button"
              className="mt-4 cursor-pointer text-sm font-medium text-peligro underline underline-offset-4 hover:text-alerta"
              onClick={() => setConfirming(true)}
            >
              {t("ui.accountDeleteButton")}
            </button>
          )}
        </section>
      )}
      {confirming && (
        <ConfirmModal
          title={t("ui.accountDeleteConfirmTitle")}
          message={t("ui.accountDeleteConfirmText")}
          confirmLabel={t("ui.accountDeleteConfirmButton")}
          pending={request.isPending}
          error={request.error}
          onConfirm={() => request.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
