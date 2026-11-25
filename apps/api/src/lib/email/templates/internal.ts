/** Correos internos al equipo de operaciones: uso cerca del límite, pedido de prueba, pedido de baja y pedido de plan. */
import { hasKey, t, tk } from "@yvy/shared";
import { P, clip, renderLayout } from "../layout";
import { base, longDate, type EmailMessage } from "../message";
import { button, chip, compare, darkStats, gap, h2, heroTitle, keyValue, type Stat } from "../widgets";

interface InternalInput {
  subject: string;
  title: string;
  lead: string;
  rows: [string, string][];
  stats?: Stat[];
  /** HTML extra de la tarjeta, sobre la tabla de datos. */
  extra?: string;
  appUrl: string;
}

/** Plantilla sobria compartida: panel con el titular del evento, tabla de datos y botón al panel interno. */
function internalEmail(i: InternalInput): EmailMessage {
  const rows = i.rows.map(([k, v]): [string, string] => [k, clip(v, 500)]);
  const url = `${base(i.appUrl)}/interno`;
  const html = renderLayout({
    subject: i.subject,
    preheader: i.lead,
    place: longDate(Date.now(), "America/Asuncion"),
    hero: heroTitle(chip(t("email.common.bandInternal"), "neutral"), i.title, i.lead) + (i.stats?.length ? gap(22) + darkStats(i.stats) : ""),
    body: `${i.extra ?? ""}${rows.length ? h2(t("email.internal.data")) + keyValue(rows) : ""}${button(url, t("email.internal.open"))}`,
    footer: t("email.common.footerInternal"),
  });
  const text = [i.title, i.lead, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `${t("email.internal.open")}: ${url}`].join("\n");
  return { subject: i.subject, html, text };
}

/** Uso de la base y del almacenamiento cerca del límite gratis, con una barra por métrica. */
export function usageEmail(i: { rows: { metric: string; pct: number }[]; appUrl: string }): EmailMessage {
  const label = (m: string) => (hasKey(`ui.usage.metric_${m}`) ? tk(`ui.usage.metric_${m}`) : m);
  return internalEmail({
    subject: t("email.internal.usageSubject"),
    title: t("email.internal.usageTitle"),
    lead: t("email.internal.usageLead"),
    rows: [],
    stats: i.rows.map((r) => ({ label: label(r.metric), value: `${r.pct} %` })),
    extra: `${h2(t("email.internal.usageBars"))}${compare(i.rows.map((r) => ({ label: label(r.metric), value: r.pct, color: r.pct >= 90 ? P.alert : P.wheat, text: `${r.pct} %` })))}${gap(24)}`,
    appUrl: i.appUrl,
  });
}

/** Pedido de prueba que llega desde la landing. */
export function trialRequestEmail(i: {
  name: string;
  whatsapp: string;
  company: string;
  crops: string;
  hectares: string;
  employees: string;
  department: string;
  appUrl: string;
}): EmailMessage {
  return internalEmail({
    subject: t("trial-requests.ops.subject", { name: clip(i.name, 80) }),
    title: t("email.internal.trialTitle"),
    lead: t("email.internal.trialLead"),
    stats: [
      { label: t("email.internal.hectares"), value: i.hectares },
      { label: t("email.internal.employees"), value: i.employees },
    ],
    rows: [
      [t("email.internal.name"), i.name],
      [t("email.internal.whatsapp"), `+${i.whatsapp}`],
      [t("email.internal.company"), i.company],
      [t("email.internal.crops"), i.crops],
      [t("email.internal.department"), i.department],
    ],
    appUrl: i.appUrl,
  });
}

/** Pedido de baja de una organización. */
export function deleteRequestEmail(i: { orgName: string; orgId: string; requester: string; requestId: string; appUrl: string }): EmailMessage {
  return internalEmail({
    subject: t("email.internal.deleteSubject", { org: clip(i.orgName, 80) }),
    title: t("email.internal.deleteTitle"),
    lead: t("email.internal.deleteLead"),
    rows: [
      [t("email.internal.org"), i.orgName],
      [t("email.internal.orgId"), i.orgId],
      [t("email.internal.requester"), i.requester],
      [t("email.internal.requestId"), i.requestId],
    ],
    appUrl: i.appUrl,
  });
}

/** Pedido de plan o de más topes. */
export function planRequestEmail(i: {
  orgName: string;
  orgId: string;
  plan: string;
  maxHa?: number | null;
  maxUsers?: number | null;
  billing?: string | null;
  note?: string | null;
  appUrl: string;
}): EmailMessage {
  const stats: Stat[] = [];
  if (i.maxHa) stats.push({ label: t("email.internal.maxHa"), value: `${i.maxHa} ha` });
  if (i.maxUsers) stats.push({ label: t("email.internal.maxUsers"), value: String(i.maxUsers) });
  const rows: [string, string][] = [
    [t("email.internal.org"), i.orgName],
    [t("email.internal.orgId"), i.orgId],
    [t("email.internal.plan"), i.plan],
  ];
  if (i.billing) rows.push([t("email.internal.billing"), i.billing]);
  if (i.note) rows.push([t("email.internal.note"), i.note]);
  return internalEmail({
    subject: t("email.internal.planSubject", { org: clip(i.orgName, 80) }),
    title: t("email.internal.planTitle"),
    lead: t("email.internal.planLead"),
    rows,
    stats,
    appUrl: i.appUrl,
  });
}
