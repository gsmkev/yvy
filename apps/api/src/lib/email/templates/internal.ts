/** Correos internos al equipo de operaciones: uso cerca del límite, pedido de prueba, pedido de baja y pedido de plan. */
import { hasKey, t, tk } from "@yvy/shared";
import { C, clip, renderLayout } from "../layout";
import { base, longDate, type EmailMessage } from "../message";
import { keyValue, kpiRow, progress, sectionTitle, type Kpi } from "../widgets";

interface InternalInput {
  subject: string;
  title: string;
  lead: string;
  rows: [string, string][];
  kpis?: Kpi[];
  extra?: ReturnType<typeof progress>[];
  appUrl: string;
}

/** Plantilla sobria compartida: banda en surco, cifras si hay, tabla de datos y botón al panel interno. */
function internalEmail(i: InternalInput): EmailMessage {
  const rows = i.rows.map(([k, v]): [string, string] => [k, clip(v, 500)]);
  const url = `${base(i.appUrl)}/interno`;
  const html = renderLayout({
    subject: i.subject,
    preheader: i.lead,
    band: longDate(Date.now(), "America/Asuncion"),
    strip: { color: C.furrow, text: t("email.common.bandInternal"), dark: true },
    title: i.title,
    lead: i.lead,
    blocks: [...(i.kpis?.length ? [kpiRow(i.kpis)] : []), ...(i.extra ?? []), sectionTitle(i.title), keyValue(rows)],
    cta: { label: t("email.internal.open"), url },
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
    rows: i.rows.map((r): [string, string] => [label(r.metric), t("email.internal.usageUsed", { pct: r.pct })]),
    kpis: i.rows.map((r) => ({ label: label(r.metric), value: String(r.pct), unit: "%" })),
    extra: i.rows.map((r) => progress({ label: label(r.metric), display: `${r.pct} %`, value: r.pct, max: 100, color: r.pct >= 90 ? C.alert : C.wheat })),
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
    kpis: [
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
  const kpis: Kpi[] = [];
  if (i.maxHa) kpis.push({ label: t("email.internal.maxHa"), value: String(i.maxHa), unit: "ha" });
  if (i.maxUsers) kpis.push({ label: t("email.internal.maxUsers"), value: String(i.maxUsers) });
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
    kpis,
    appUrl: i.appUrl,
  });
}
