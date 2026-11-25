/** Correos de cuenta: código de ingreso, mención en un comentario e informe de riesgo para leads. */
import { localDate, localTime, safeHtml, t, tk, type FarmRisk, type Markup } from "@yvy/shared";
import { P, clip, font, lines, renderLayout } from "../layout";
import { base, dm, longDate, settingsUrl, unsubscribe, type EmailMessage } from "../message";
import { bigCode, bullets, button, chip, darkBars, darkStats, fmtNum, gap, h2, heroQuote, heroTitle, keyValue, note, trend } from "../widgets";

const TZ = "America/Asuncion";

// ---------- Código de ingreso ----------

/** Código de ingreso: se escribe en la app, por eso no lleva botón. Muestra a qué hora se pidió y cuándo vence. */
export function loginCodeEmail(i: { code: string; minutes: number; now?: number }): EmailMessage {
  const now = i.now ?? Date.now();
  const expires = localTime(now + i.minutes * 60_000, TZ);
  const subject = t("email.login.subject", { code: i.code });
  const security = [t("email.login.security1"), t("email.login.security2"), t("email.login.security3")];
  const html = renderLayout({
    subject,
    preheader: t("email.login.preheader", { time: expires }),
    place: t("email.common.bandLogin"),
    hero: safeHtml`${heroTitle(chip(t("email.login.strip", { minutes: i.minutes }), "neutral"), t("email.login.title"), t("email.login.lead"))}${gap(22)}${bigCode(i.code)}`,
    body: safeHtml`${h2(t("email.login.details"))}${keyValue([
      [t("email.login.kpiRequested"), localTime(now, TZ)],
      [t("email.login.kpiExpires"), expires],
    ])}${gap(24)}${h2(t("email.login.securityTitle"), "0 0 6px")}${bullets(security)}`,
    footer: t("email.common.footerLogin"),
  });
  const text = [t("email.login.textCode", { code: i.code, minutes: i.minutes }), t("email.login.lead"), "", ...security].join("\n");
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

/** Mención en un comentario: quién y la cita en el panel; el registro y el lote en la tarjeta, con botón para responder. */
export function mentionEmail(i: { author: string | null; body: string; appUrl: string; now?: number; record?: MentionRecord | null }): EmailMessage {
  const now = i.now ?? Date.now();
  const name = clip(i.author || t("email.mention.anyone"), 80);
  const subject = t("email.mention.subject", { name });
  const body = clip(i.body, 600);
  const url = `${base(i.appUrl)}/registros`;
  const r = i.record;
  const where = r ? clip(r.plotName ?? r.farmName ?? "", 80) : "";
  const rows: [string, string][] = [];
  if (r) {
    rows.push([t("email.mention.kpiRecord"), clip(tk(`record-kinds.kind.${r.kind}`), 40)]);
    if (r.farmName) rows.push([t("email.mention.kpiFarm"), clip(r.farmName, 120)]);
    if (r.plotName) rows.push([t("email.mention.kpiWhere"), clip(r.plotName, 80)]);
    if (r.capturedAt) rows.push([t("email.mention.kpiWhen"), dm(localDate(r.capturedAt, TZ))]);
  }
  const html = renderLayout({
    subject,
    preheader: t("email.mention.preheader"),
    place: longDate(now, TZ),
    hero: safeHtml`${heroTitle(chip(t("email.mention.strip"), "neutral"), t("email.mention.title", { name }), where ? t("email.mention.lead", { where }) : t("email.mention.leadNoWhere"))}${gap(20)}${heroQuote(name, lines(body))}`,
    body: safeHtml`${rows.length ? safeHtml`${h2(t("email.mention.context"))}${keyValue(rows)}` : ""}${button(url, t("email.mention.reply"))}`,
    footer: t("email.common.footerMention"),
    settings: { label: t("email.common.settings"), url: settingsUrl(i.appUrl) },
  });
  const text = [subject, "", `${name}: ${body}`, "", `${t("email.mention.reply")}: ${url}`, `${t("email.common.settings")}: ${settingsUrl(i.appUrl)}`].join("\n");
  return { subject, html, text, headers: unsubscribe(i.appUrl) };
}

// ---------- Informe para leads ----------

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Informe gratis de riesgo climático: cifras y lluvia normal por mes en el panel; heladas por año y botón en la tarjeta. */
export function leadEmail(i: { link: string; days: number; report?: FarmRisk | null }): EmailMessage {
  const subject = t("email.lead.subject");
  const r = i.report ?? null;
  const years = r ? Math.max(1, r.normalTo - r.normalFrom + 1) : 30;
  const nearest = r?.fire?.nearestKm ?? null;
  const stats: Markup | "" = r
    ? darkStats([
        { label: t("email.lead.kpiFrost"), value: `${fmtNum(r.frost.meanPerYear, 1)} ${t("email.lead.unitDays")}` },
        { label: t("email.lead.kpiRain"), value: `${fmtNum(r.rain.annualMeanMm)} mm` },
        { label: t("email.lead.kpiDry"), value: `${fmtNum(r.dry.meanLongestDays)} ${t("email.lead.unitDays")}` },
        { label: t("email.lead.kpiFire"), value: nearest !== null ? `${fmtNum(nearest, 1)} km` : t("email.lead.noFire") },
      ])
    : "";
  const monthly = r?.rain.normal ?? [];
  const mean = monthly.length ? monthly.reduce((a, m) => a + m.meanMm, 0) / monthly.length : 0;
  const frostYears = (r?.frost.perYear ?? []).slice(-24).map((y) => y.days);
  const mmdd = (s: string | null) => (s ? `${s.slice(3, 5)}/${s.slice(0, 2)}` : "");
  const months = monthly.length
    ? safeHtml`${gap(22)}${darkBars(monthly.map((m) => ({ label: MONTHS[m.month - 1]!, value: Math.round(m.meanMm), strong: m.meanMm >= mean })), t("email.lead.rainLegend", { mm: Math.round(mean) }), 72)}`
    : "";
  const frostNote = r?.frost.typicalFirstFrost
    ? safeHtml`<div style="padding-top:8px;${font(13, P.ink2)}" class="t2">${t("email.lead.frostNote", { first: mmdd(r.frost.typicalFirstFrost), last: mmdd(r.frost.typicalLastFrost) })}</div>`
    : "";
  const frost = frostYears.length > 3 ? safeHtml`${h2(t("email.lead.frostChart"), "0 0 6px")}${trend(frostYears, P.sky)}${frostNote}${gap(24)}` : "";
  const html = renderLayout({
    subject,
    preheader: t("email.lead.preheader"),
    place: t("email.common.bandLead"),
    hero: safeHtml`${heroTitle(chip(t("email.lead.days", { days: i.days }), "neutral"), t("email.lead.title"), t("email.lead.lead", { years }))}${stats ? safeHtml`${gap(22)}${stats}` : ""}${months}`,
    body: safeHtml`${frost}${h2(t("email.lead.contains"), "0 0 6px")}${bullets([t("email.lead.item1"), t("email.lead.item2"), t("email.lead.item3"), t("email.lead.item4")])}${note(t("email.lead.note"))}${button(i.link, t("email.lead.open"))}`,
    footer: t("email.common.footerLead"),
  });
  const text = [
    t("email.lead.title"),
    "",
    t("email.lead.lead", { years }),
    ...(r ? [`${t("email.lead.kpiFrost")}: ${fmtNum(r.frost.meanPerYear, 1)}`, `${t("email.lead.kpiRain")}: ${fmtNum(r.rain.annualMeanMm)} mm`, `${t("email.lead.kpiDry")}: ${fmtNum(r.dry.meanLongestDays)}`] : []),
    "",
    `${t("email.lead.open")}: ${i.link}`,
    "",
    t("email.lead.days", { days: i.days }),
    t("email.lead.note"),
    t("email.common.footerLead"),
  ].join("\n");
  return { subject, html, text };
}
