import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { NotificationPrefs } from "../../components/NotificationPrefs";
import { CalendarFeed } from "../../components/CalendarFeed";
import { WebhooksPanel } from "../../components/Webhooks";
import { Preferences } from "../../components/Preferences";
import { PlanPanel } from "../../components/PlanPanel";
import { AdminTotpPolicy, TotpSection } from "../../components/Totp";
import { SectionNav } from "../../components/SectionNav";
import { Button, ConfirmModal, Page, SectionHead, Spinner, toast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { t, type MessageKey } from "../../lib/i18n";
import { useMe } from "../../lib/queries";

/** Código personal de referido del agrónomo y el enlace de registro que lo lleva. */
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
    <section className="flex flex-col gap-1">
      <SectionHead title={t(me.data?.role === "owner" ? "ui.account.referralTitleProducer" : "ui.account.referralTitle")} />
      <p className="mt-2 text-tinta-2">{t(me.data?.role === "owner" ? "ui.account.referralTextProducer" : "ui.account.referralText")}</p>
      <p className="mt-4 text-sm text-tinta-2">{t("ui.account.referralCode")}</p>
      <p className="num text-2xl font-semibold tracking-wider">{code}</p>
      {(q.data?.referred ?? 0) > 0 && (
        <p className="mt-2 text-sm">{t("ui.account.referralCount", { n: q.data!.referred, c: q.data!.credited })}</p>
      )}
      <p className="mt-3 text-sm text-tinta-2">{t("ui.account.referralLink")}</p>
      <p className="text-sm break-all">{link}</p>
      <button
        type="button"
        className="mt-2 cursor-pointer text-sm font-medium text-accion underline underline-offset-4"
        onClick={() => void copy()}
        aria-live="polite"
      >
        {copied ? t("ui.common.copied") : t("ui.account.referralCopy")}
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

/** Cuenta (solo dueño): por ahora, el pedido de baja. No borra nada. */
export function AccountPage() {
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const referral = useQuery({ queryKey: ["referral"], queryFn: () => get<{ code: string | null; referred: number; credited: number }>("/me/referral") });
  const [picked, setPicked] = useState(() => HASH_TO_SECTION[window.location.hash.slice(1)] ?? "prefs");
  const request = useMutation({
    mutationFn: () => post("/org/delete-request"),
    onSuccess: () => {
      setConfirming(false);
      toast(t("ui.toast.deleteRequested"));
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
      group: "danger",
      show: owner,
      render: () => (
        <section>
          <SectionHead title={t("ui.account.deleteTitle")} />
          <p className="mt-3 text-tinta-2">{t("ui.account.deleteText")}</p>
          {request.isSuccess ? (
            <p role="status" className="mt-4 border-l-2 border-soja pl-3">
              {t("ui.account.deleteSent")}
            </p>
          ) : (
            <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
              {t("ui.account.deleteButton")}
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
    <Page width="data" title={t("ui.account.title")} className="gap-4 lg:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-10">
      <SectionNav
        label={t("ui.account.title")}
        value={current.id}
        onChange={choose}
        groups={(["me", "security", "org", "danger"] as const)
          .map((g) => ({
            id: g,
            label: g === "danger" ? undefined : t(`ui.account.group_${g}`),
            alwaysLabel: g === "security",
            danger: g === "danger",
            items: sections.filter((x) => x.group === g).map((x) => ({ id: x.id, label: t(`ui.account.section_${x.id}` as MessageKey) })),
          }))
          .filter((g) => g.items.length > 0)}
      />
      <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5">
        <div key={current.id}>{current.render()}</div>
      </div>
      </div>
      {confirming && (
        <ConfirmModal
          title={t("ui.account.deleteConfirmTitle")}
          message={t("ui.account.deleteConfirmText")}
          confirmLabel={t("ui.account.deleteConfirmButton")}
          pending={request.isPending}
          error={request.error}
          onConfirm={() => request.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </Page>
  );
}
