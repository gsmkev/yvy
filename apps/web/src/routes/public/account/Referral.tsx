/** Código personal de referido del agrónomo y el enlace de registro que lo lleva. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionHead } from "../../../components/ui";
import { get } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { useMe } from "../../../lib/queries";

/** Código de referido con cuántas organizaciones llegaron por él y el enlace para compartir. */
export function Referral() {
  const q = useQuery({ queryKey: ["referral"], queryFn: () => get<{ code: string | null; referred: number; credited: number }>("/me/referral") });
  const [copied, setCopied] = useState(false);
  const me = useMe();
  const code = q.data?.code;
  if (!code) return null;
  const producer = me.data?.role === "owner";
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
      <SectionHead title={t(producer ? "ui.account.referralTitleProducer" : "ui.account.referralTitle")} />
      <p className="mt-2 text-tinta-2">{t(producer ? "ui.account.referralTextProducer" : "ui.account.referralText")}</p>
      <p className="mt-4 text-sm text-tinta-2">{t("ui.account.referralCode")}</p>
      <p className="num text-2xl font-semibold tracking-wider">{code}</p>
      {(q.data?.referred ?? 0) > 0 && <p className="mt-2 text-sm">{t("ui.account.referralCount", { n: q.data!.referred, c: q.data!.credited })}</p>}
      <p className="mt-3 text-sm text-tinta-2">{t("ui.account.referralLink")}</p>
      <p className="text-sm break-all">{link}</p>
      <button type="button" className="mt-2 cursor-pointer text-sm font-medium text-accion underline underline-offset-4" onClick={() => void copy()} aria-live="polite">
        {copied ? t("ui.common.copied") : t("ui.account.referralCopy")}
      </button>
    </section>
  );
}
