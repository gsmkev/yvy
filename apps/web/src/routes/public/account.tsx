/** Cuenta: preferencias, avisos, calendario, seguridad, webhooks, plan y baja, según el rol. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { SectionNav } from "../../components/SectionNav";
import { Page, Spinner } from "../../components/ui";
import { get } from "../../lib/api";
import { t, type MessageKey } from "../../lib/i18n";
import { useMe } from "../../lib/queries";
import { HASHES, HASH_TO_SECTION, accountSections } from "./account/sections";

const GROUPS = ["me", "security", "org", "danger"] as const;

/** Cuenta de quien mira, con un menú de secciones según su rol. */
export function AccountPage() {
  const me = useMe();
  const referral = useQuery({ queryKey: ["referral"], queryFn: () => get<{ code: string | null; referred: number; credited: number }>("/me/referral") });
  const [picked, setPicked] = useState(() => HASH_TO_SECTION[window.location.hash.slice(1)] ?? "prefs");
  if (me.isLoading) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }
  const role = me.data?.role;
  const sections = accountSections({ loaded: !!me.data, field: !!me.data && isFieldRole(me.data.role), owner: role === "owner", admin: role === "owner" || role === "admin", hasReferral: !!referral.data?.code });
  const current = sections.find((x) => x.id === picked) ?? sections[0]!;
  const choose = (id: string) => {
    setPicked(id);
    try {
      window.history.replaceState(null, "", `#${HASHES[id] ?? id}`);
    } catch {
      /* sin historial: queda la sección elegida */
    }
  };
  const groups = GROUPS.map((g) => ({
    id: g,
    label: g === "danger" ? undefined : t(`ui.account.group_${g}`),
    alwaysLabel: g === "security",
    danger: g === "danger",
    items: sections.filter((x) => x.group === g).map((x) => ({ id: x.id, label: t(`ui.account.section_${x.id}` as MessageKey) })),
  })).filter((g) => g.items.length > 0);
  return (
    <Page width="data" title={t("ui.account.title")} className="gap-4 lg:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-10">
        <SectionNav label={t("ui.account.title")} value={current.id} onChange={choose} groups={groups} />
        <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5">
          <div key={current.id}>{current.render()}</div>
        </div>
      </div>
    </Page>
  );
}
