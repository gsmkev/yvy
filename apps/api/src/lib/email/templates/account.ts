/** Correos de cuenta: código de ingreso, mención en un comentario e informe de riesgo para leads. */
import { localDate, localTime, raw, t, tk, type FarmRisk } from "@yvy/shared";
import { C, SERIF, clip, esc, renderLayout } from "../layout";
import { base, dm, longDate, settingsUrl, unsubscribe, type EmailMessage } from "../message";
import { barChart, callout, fmtNum, kpiRow, quote, sectionTitle, sparkline } from "../widgets";

const TZ = "America/Asuncion";

// ---------- Código de ingreso ----------

/** Código de ingreso: se escribe en la app, por eso no lleva botón. Muestra a qué hora se pidió y cuándo vence. */
export function loginCodeEmail(i: { code: string; minutes: number; now?: number }): EmailMessage {
  const now = i.now ?? Date.now();
  const expires = localTime(now + i.minutes * 60_000, TZ);
  const subject = t("email.login.subject", { code: i.code });
  const box = raw(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" class="soft t1" style="background:${C.soft};border-radius:8px;padding:24px 12px;font-family:${SERIF};font-size:44px;line-height:48px;font-weight:700;letter-spacing:10px;color:${C.furrow};">${esc(i.code)}</td></tr></table>`,
  );
  const security = [t("email.login.security1"), t("email.login.security2"), t("email.login.security3")];
  const html = renderLayout({
    subject,
    preheader: t("email.login.preheader", { time: expires }),
    band: t("email.common.bandLogin"),
    strip: { color: C.soyDark, text: t("email.login.strip", { minutes: i.minutes }), dark: true },
    title: t("email.login.title"),
    lead: t("email.login.lead"),
    blocks: [
      box,
      raw(`<div style="height:16px;font-size:0;line-height:0;">&nbsp;</div>`),
      kpiRow([
        { label: t("email.login.kpiRequested"), value: localTime(now, TZ) },
        { label: t("email.login.kpiExpires"), value: expires },
      ]),
      callout(t("email.login.securityTitle"), security),
    ],
    footer: t("email.common.footerLogin"),
  });
  const text = [t("email.login.title"), "", i.code, "", `${t("email.login.lead")} ${t("email.login.strip", { minutes: i.minutes })}.`, "", ...security].join("\n");
  return { subject, html, text };
}

// ---------- Mención ----------

/** Registro donde dejaron el comentario. */
export interface MentionRecord {
  kind: string;
  farmName: string | null;
  plotName: string | null;
  capturedAt: number | null;
}

/** Mención en un comentario: quién, la cita, de qué registro y un botón para responder. */
export function mentionEmail(i: { author: string | null; body: string; appUrl: string; now?: number; record?: MentionRecord | null }): EmailMessage {
  const now = i.now ?? Date.now();
  const name = clip(i.author || t("email.mention.anyone"), 80);
  const subject = t("email.mention.subject", { name });
  const body = clip(i.body, 600);
  const url = `${base(i.appUrl)}/registros`;
  const r = i.record;
  const where = r ? clip(r.plotName ?? r.farmName ?? "", 80) : "";
  const kpis = r
    ? [
        { label: t("email.mention.kpiRecord"), value: clip(tk(`record-kinds.kind.${r.kind}`), 30) },
        ...(where ? [{ label: t("email.mention.kpiWhere"), value: where }] : []),
        ...(r.capturedAt ? [{ label: t("email.mention.kpiWhen"), value: dm(localDate(r.capturedAt, TZ)) }] : []),
      ]
    : [];
  const html = renderLayout({
    subject,
    preheader: t("email.mention.preheader"),
    band: t("email.common.bandMention", { date: longDate(now, TZ) }),
    strip: { color: C.soy, text: t("email.mention.strip") },
    context: r?.farmName ? clip(r.farmName, 120) : undefined,
    title: t("email.mention.title", { name }),
    lead: where ? t("email.mention.lead", { where }) : t("email.mention.leadNoWhere"),
    blocks: [quote(name, body), ...(kpis.length ? [raw(`<div style="height:20px;font-size:0;line-height:0;">&nbsp;</div>`), kpiRow(kpis.slice(0, 3))] : [])],
    cta: { label: t("email.mention.reply"), url },
    footer: t("email.common.footerMention"),
    settings: { label: t("email.common.settings"), url: settingsUrl(i.appUrl) },
  });
  const text = [subject, "", `${name}: ${body}`, "", `${t("email.mention.reply")}: ${url}`, `${t("email.common.settings")}: ${settingsUrl(i.appUrl)}`].join("\n");
  return { subject, html, text, headers: unsubscribe(i.appUrl) };
}

// ---------- Informe para leads ----------

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Informe gratis de riesgo climático: cifras del informe, lluvia normal por mes, heladas por año y botón al informe completo. */
export function leadEmail(i: { link: string; days: number; report?: FarmRisk | null }): EmailMessage {
  const subject = t("email.lead.subject");
  const r = i.report ?? null;
  const years = r ? Math.max(1, r.normalTo - r.normalFrom + 1) : 30;
  const nearest = r?.fire?.nearestKm ?? null;
  const kpis = r
    ? [
        { label: t("email.lead.kpiFrost"), value: fmtNum(r.frost.meanPerYear, 1), unit: t("email.lead.unitDays") },
        { label: t("email.lead.kpiRain"), value: fmtNum(r.rain.annualMeanMm), unit: "mm" },
        { label: t("email.lead.kpiDry"), value: fmtNum(r.dry.meanLongestDays), unit: t("email.lead.unitDays") },
        nearest !== null ? { label: t("email.lead.kpiFire"), value: fmtNum(nearest, 1), unit: t("email.lead.unitKm") } : { label: t("email.lead.kpiFire"), value: t("email.lead.noFire") },
      ]
    : [];
  const monthly = r?.rain.normal ?? [];
  const mean = monthly.length ? monthly.reduce((a, m) => a + m.meanMm, 0) / monthly.length : 0;
  const frostYears = (r?.frost.perYear ?? []).slice(-24).map((y) => y.days);
  const mmdd = (s: string | null) => (s ? `${s.slice(3, 5)}/${s.slice(0, 2)}` : "");
  const blocks = [
    ...(kpis.length ? [kpiRow(kpis)] : []),
    ...(monthly.length
      ? [
          sectionTitle(t("email.lead.rainChart")),
          barChart({
            bars: monthly.map((m) => ({ label: MONTHS[m.month - 1]!, value: Math.round(m.meanMm), strong: m.meanMm >= mean })),
            legend: [
              { color: C.skyDark, text: t("email.lead.rainLegendStrong") },
              { color: C.sky, text: t("email.lead.rainLegendLight") },
            ],
          }),
        ]
      : []),
    ...(frostYears.length > 3
      ? [
          sectionTitle(t("email.lead.frostChart"), r?.frost.typicalFirstFrost ? t("email.lead.frostNote", { first: mmdd(r.frost.typicalFirstFrost), last: mmdd(r.frost.typicalLastFrost) }) : undefined),
          sparkline(frostYears),
        ]
      : []),
  ];
  const html = renderLayout({
    subject,
    preheader: t("email.lead.preheader"),
    band: t("email.common.bandLead"),
    strip: { color: C.sky, text: t("email.lead.days", { days: i.days }) },
    title: t("email.lead.title"),
    lead: t("email.lead.lead", { years }),
    blocks: [...blocks, callout(t("email.lead.noteTitle"), [t("email.lead.note")])],
    cta: { label: t("email.lead.open"), url: i.link },
    footer: t("email.common.footerLead"),
  });
  const text = [
    t("email.lead.title"),
    "",
    t("email.lead.lead", { years }),
    ...kpis.map((k) => `${k.label}: ${k.value}${"unit" in k && k.unit ? ` ${k.unit}` : ""}`),
    "",
    `${t("email.lead.open")}: ${i.link}`,
    "",
    t("email.lead.days", { days: i.days }),
    t("email.lead.note"),
    t("email.common.footerLead"),
  ].join("\n");
  return { subject, html, text };
}
