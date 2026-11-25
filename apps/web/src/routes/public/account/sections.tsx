/** Secciones de la cuenta: cuáles ve cada rol y cómo se enlazan por el # de la URL. */
import type { ReactNode } from "react";
import { CalendarFeed } from "../../../components/CalendarFeed";
import { NotificationPrefs } from "../../../components/NotificationPrefs";
import { PlanPanel } from "../../../components/PlanPanel";
import { Preferences } from "../../../components/Preferences";
import { AdminTotpPolicy, TotpSection } from "../../../components/Totp";
import { WebhooksPanel } from "../../../components/Webhooks";
import { DeleteSection } from "./DeleteSection";
import { Referral } from "./Referral";

/** Una sección de la cuenta: grupo del menú, si se muestra y cómo se dibuja. */
export interface AccountSection {
  id: string;
  group: "me" | "security" | "org" | "danger";
  show: boolean;
  render: () => ReactNode;
}

/** Enlaces como /cuenta#preferencias o #segundo-factor siguen llevando a su sección. */
export const HASH_TO_SECTION: Record<string, string> = {
  preferencias: "prefs",
  avisos: "notifs",
  calendario: "calendar",
  referido: "referral",
  "segundo-factor": "totp",
  webhooks: "webhooks",
  plan: "plan",
  baja: "delete",
};

/** Id de sección a #. */
export const HASHES: Record<string, string> = Object.fromEntries(Object.entries(HASH_TO_SECTION).map(([h, id]) => [id, h]));

/** Qué sabe la pantalla de quien mira. */
export interface Viewer {
  loaded: boolean;
  field: boolean;
  owner: boolean;
  admin: boolean;
  hasReferral: boolean;
}

/** Las secciones que ve esa persona. */
export function accountSections(v: Viewer): AccountSection[] {
  const all: AccountSection[] = [
    { id: "prefs", group: "me", show: true, render: () => <Preferences /> },
    { id: "notifs", group: "me", show: true, render: () => <NotificationPrefs /> },
    { id: "calendar", group: "me", show: true, render: () => <CalendarFeed /> },
    { id: "referral", group: "me", show: v.hasReferral, render: () => <Referral /> },
    {
      id: "totp",
      group: "security",
      show: v.loaded && !v.field,
      render: () => (
        <div className="flex flex-col gap-8">
          <TotpSection />
          {v.owner && <AdminTotpPolicy />}
        </div>
      ),
    },
    { id: "webhooks", group: "org", show: v.admin, render: () => <WebhooksPanel /> },
    { id: "plan", group: "org", show: v.owner, render: () => <PlanPanel /> },
    { id: "delete", group: "danger", show: v.owner, render: () => <DeleteSection /> },
  ];
  return all.filter((x) => x.show);
}
