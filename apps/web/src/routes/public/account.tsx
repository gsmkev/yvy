import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { NotificationPrefs } from "../../components/NotificationPrefs";
import { CalendarFeed } from "../../components/CalendarFeed";
import { WebhooksPanel } from "../../components/Webhooks";
import { Preferences } from "../../components/Preferences";
import { PlanPanel } from "../../components/PlanPanel";
import { AdminTotpPolicy, TotpSection } from "../../components/Totp";
import { SectionNav, sectionLayoutCls } from "../../components/SectionNav";
import { Button, ConfirmModal, PageHeader, Spinner, toast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { t, type MessageKey } from "../../lib/i18n";
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
    <section>
      <h2 className="text-[18px] leading-6 font-semibold">{t(me.data?.role === "owner" ? "ui.accountReferralTitleProducer" : "ui.accountReferralTitle")}</h2>
      <p className="mt-2 text-tinta-2">{t(me.data?.role === "owner" ? "ui.accountReferralTextProducer" : "ui.accountReferralText")}</p>
      <p className="mt-4 text-sm text-tinta-2">{t("ui.accountReferralCode")}</p>
      <p className="num text-2xl font-semibold tracking-wider">{code}</p>
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

/** Enlaces como /cuenta#preferencias o #segundo-factor siguen llevando a su sección. */
const HASH_TO_SECTION: Record<string, string> = {
  preferencias: "prefs",
  avisos: "notifs",
  calendario: "calendar",
  referido: "referral",
  "segundo-factor": "totp",
  webhooks: "webhooks",
  plan: "plan",
  baja: "delete",
};
const HASHES: Record<string, string> = Object.fromEntries(Object.entries(HASH_TO_SECTION).map(([h, id]) => [id, h]));

/** Cuenta (solo dueño): por ahora, el pedido de baja (P-09). No borra nada. */
export function AccountPage() {
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const referral = useQuery({ queryKey: ["referral"], queryFn: () => get<{ code: string | null; referred: number; credited: number }>("/me/referral") });
  const [picked, setPicked] = useState(() => HASH_TO_SECTION[window.location.hash.slice(1)] ?? "prefs");
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

  const field = !!me.data && isFieldRole(me.data.role);
  const owner = me.data?.role === "owner";
  const admin = owner || me.data?.role === "admin";
  const sections = [
    { id: "prefs", group: "me", show: true, render: () => <Preferences /> },
    { id: "notifs", group: "me", show: true, render: () => <NotificationPrefs /> },
    { id: "calendar", group: "me", show: true, render: () => <CalendarFeed /> },
    { id: "referral", group: "me", show: !!referral.data?.code, render: () => <Referral /> },
    {
      id: "totp",
      group: "security",
      show: !!me.data && !field,
      render: () => (
        <div className="flex flex-col gap-8">
          <TotpSection />
          {owner && <AdminTotpPolicy />}
        </div>
      ),
    },
    { id: "webhooks", group: "org", show: admin, render: () => <WebhooksPanel /> },
    { id: "plan", group: "org", show: owner, render: () => <PlanPanel /> },
    {
      id: "delete",
      group: "org",
      show: owner,
      render: () => (
        <section>
          <h2 className="text-[18px] leading-6 font-semibold">{t("ui.accountDeleteTitle")}</h2>
          <p className="mt-2 text-tinta-2">{t("ui.accountDeleteText")}</p>
          {request.isSuccess ? (
            <p role="status" className="mt-4 border-l-2 border-soja pl-3">
              {t("ui.accountDeleteSent")}
            </p>
          ) : (
            <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
              {t("ui.accountDeleteButton")}
            </Button>
          )}
        </section>
      ),
    },
  ].filter((x) => x.show);
  const current = sections.find((x) => x.id === picked) ?? sections[0]!;
  const choose = (id: string) => {
    setPicked(id);
    try {
      window.history.replaceState(null, "", `#${HASHES[id] ?? id}`);
    } catch {
      /* sin historial: queda la sección elegida */
    }
  };
  return (
    <div className={`${sectionLayoutCls} max-w-5xl`}>
      <SectionNav
        label={t("ui.accountTitle")}
        value={current.id}
        onChange={choose}
        groups={(["me", "security", "org"] as const)
          .map((g) => ({
            id: g,
            label: t(`ui.accountGroup_${g}`),
            items: sections.filter((x) => x.group === g).map((x) => ({ id: x.id, label: t(`ui.accountSection_${x.id}` as MessageKey) })),
          }))
          .filter((g) => g.items.length > 0)}
      />
      <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5">
        <PageHeader title={t("ui.accountTitle")} />
        <div key={current.id}>{current.render()}</div>
      </div>
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
