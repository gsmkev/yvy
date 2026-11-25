/** Parte semanal de una estancia: cifras con variación, lluvia por día, registros por tipo, tareas y lotes que perdieron vigor. */
import { raw, safeHtml, t, tk, type Markup } from "@yvy/shared";
import { P, clip, font, renderLayout } from "../layout";
import { base, dm, settingsUrl, unsubscribe, weekdayShort, type EmailMessage } from "../message";
import { bullets, button, chip, compare, darkBars, darkStats, fmtNum, gap, h2, heroTitle, note, plotRows, type Stat } from "../widgets";

/** Lote cuyo vigor (NDVI medio) bajó entre las dos últimas escenas. */
export interface WorsenedPlot {
  name: string;
  from: number;
  to: number;
  /** Serie de NDVI medio de las últimas escenas, de la más vieja a la más nueva. */
  series?: number[];
}

/** Datos del parte semanal de una estancia. */
export interface WeeklyEmailInput {
  farmId: string;
  farmName: string;
  /** Nombre de la organización: solo en la variante para destinatarios externos. */
  externalOrg?: string;
  /** Primer y último día de la semana (ISO). */
  from: string;
  to: string;
  records: number;
  authors: number;
  /** Registros de la semana anterior, para la variación. */
  prevRecords?: number | null;
  rainMm: number | null;
  /** Lluvia de cada día de la semana. */
  rainDaily?: { date: string; mm: number }[];
  /** Resúmenes de los avisos de la semana. */
  alerts: string[];
  overdueTasks: number;
  /** Tareas de la semana: hechas y total. */
  tasksDone?: number;
  tasksTotal?: number;
  /** Registros por tipo. */
  byKind: { kind: string; n: number }[];
  worsened?: WorsenedPlot[];
  hasPdf: boolean;
  /** Enlace firmado al PDF: va solo en el texto, para clientes que no muestran adjuntos. */
  pdfUrl?: string;
  appUrl: string;
}

/** Fecha ISO sumando días (UTC). */
const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function stats(i: WeeklyEmailInput): Stat[] {
  const diff = i.prevRecords != null ? i.records - i.prevRecords : 0;
  return [
    {
      label: t("email.weekly.records"),
      value: String(i.records),
      delta: diff > 0 ? { text: t("email.weekly.more", { n: diff }), tone: "good" } : undefined,
    },
    { label: t("email.weekly.rain"), value: i.rainMm !== null ? `${fmtNum(i.rainMm)} mm` : "-" },
    { label: t("email.weekly.alerts"), value: String(i.alerts.length) },
    { label: t("email.weekly.overdue"), value: String(i.overdueTasks) },
  ];
}

function tasksBlock(i: WeeklyEmailInput): Markup {
  const total = i.tasksTotal ?? 0;
  if (total <= 0) return raw("");
  const done = i.tasksDone ?? 0;
  const late = Math.min(i.overdueTasks, total - done);
  const open = Math.max(0, total - done - late);
  const part = (n: number, color: string, first: boolean, last: boolean) => {
    const radius = `${first ? "border-radius:5px 0 0 5px;" : ""}${last ? "border-radius:0 5px 5px 0;" : ""}`;
    return n > 0 ? safeHtml`<td width="${Math.round((n / total) * 100)}%" height="10" style="height:10px;background:${color};${radius}font-size:0;line-height:0;">&nbsp;</td>` : "";
  };
  const bar = safeHtml`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${part(done, P.soy, true, open + late === 0)}${part(open, P.neutralBar, done === 0, late === 0)}${part(late, P.alert, done + open === 0, true)}</tr></table>`;
  const strong = (n: number, color?: string) => safeHtml`<span style="font-weight:600;${color ? `color:${color};` : ""}" class="${color ? "" : "t1"}">${n}</span>`;
  const caption = safeHtml`${strong(done)} ${t("email.weekly.done")} <span style="padding-left:12px;">${strong(open)} ${t("email.weekly.open")}</span> <span style="padding-left:12px;">${strong(late, P.alert)} ${t("email.weekly.late")}</span>`;
  return safeHtml`${gap(26)}${h2(t("email.weekly.tasks"))}${bar}<div style="padding-top:8px;${font(13, P.ink2)}" class="t2">${caption}</div>`;
}

function worsenedBlock(i: WeeklyEmailInput): Markup {
  const rows = (i.worsened ?? []).slice(0, 5).map((w) => {
    const change = w.from > 0 ? Math.round(((w.to - w.from) / w.from) * 100) : 0;
    return {
      name: w.name,
      detail: t("email.weekly.worseDetail", { to: fmtNum(w.to, 2), from: fmtNum(w.from, 2) }),
      value: `${change} %`,
      valueColor: change <= -20 ? P.alert : P.wheatText,
      spark: w.series && w.series.length >= 3 ? w.series : undefined,
      sub: t("email.weekly.worseSub"),
    };
  });
  return rows.length ? safeHtml`${gap(26)}${h2(t("email.weekly.worse"), "0 0 4px")}${plotRows(rows)}` : raw("");
}

/** Panel oscuro del parte: titular, cifras y lluvia por día. */
function weeklyHero(i: WeeklyEmailInput, org: string, lead: string): Markup {
  const days = Array.from({ length: 7 }, (_, n) => addDays(i.from, n)).filter((d) => d <= i.to);
  const rainByDay = new Map((i.rainDaily ?? []).map((r) => [r.date, Math.round(r.mm)]));
  const bars = days.map((d) => ({ label: weekdayShort(d), value: rainByDay.get(d) ?? 0, strong: (rainByDay.get(d) ?? 0) >= 10 }));
  const rain = (i.rainDaily?.length ?? 0) > 0 ? safeHtml`${gap(22)}${darkBars(bars, t("email.weekly.rainLegend", { mm: 10 }), 64)}` : "";
  return safeHtml`${heroTitle(chip(org ? t("email.weekly.fromOrg", { org }) : t("email.weekly.strip"), "neutral"), clip(i.farmName, 120), lead)}${gap(22)}${darkStats(stats(i))}${rain}`;
}

/** Tarjeta del parte; sin `webUrl` (variante externa) no lleva botón. */
function weeklyBody(i: WeeklyEmailInput, webUrl: string): Markup {
  const top = [...i.byKind].sort((a, b) => b.n - a.n).slice(0, 6);
  const kinds = top.length ? safeHtml`${h2(t("email.weekly.byKind"))}${compare(top.map((k) => ({ label: clip(tk(`record-kinds.kind.${k.kind}`), 24), value: k.n, color: P.soy, text: String(k.n) })))}` : "";
  const alerts = i.alerts.length ? safeHtml`${gap(26)}${h2(t("email.weekly.alertsTitle"), "0 0 6px")}${bullets(i.alerts.slice(0, 4).map((a) => clip(a, 160)))}` : "";
  const open = webUrl ? button(webUrl, t("email.weekly.openReport")) : "";
  return safeHtml`${kinds}${tasksBlock(i)}${worsenedBlock(i)}${alerts}${note(i.hasPdf ? t("email.weekly.pdfAttached") : t("email.weekly.pdfLater"))}${open}`;
}

/** Parte semanal; la variante externa no lleva enlaces que pidan sesión ni ajustes de avisos. */
export function weeklyEmail(i: WeeklyEmailInput): EmailMessage {
  const farm = clip(i.farmName, 120);
  const org = i.externalOrg ? clip(i.externalOrg, 120) : "";
  const subject = org ? t("email.weekly.subjectExternal", { farm, org }) : t("email.weekly.subject", { farm });
  const web = `${base(i.appUrl)}/estancias/${encodeURIComponent(i.farmId)}/parte?desde=${i.from}&hasta=${i.to}`;
  const rain = i.rainMm !== null ? `${fmtNum(i.rainMm)} mm` : t("email.weekly.noRain");
  const diff = i.prevRecords != null ? i.records - i.prevRecords : 0;
  const lead = diff > 0 ? t("email.weekly.leadMore", { n: diff }) : t("email.weekly.lead", { records: i.records, authors: i.authors });
  const hero = weeklyHero(i, org, lead);
  const body = weeklyBody(i, org ? "" : web);
  const html = renderLayout({
    subject,
    preheader: t("email.weekly.preheader", { records: i.records, rain, overdue: i.overdueTasks }),
    place: t("email.common.bandWeekly", { from: dm(i.from), to: dm(i.to) }),
    hero,
    body,
    footer: org ? t("email.common.footerExternal", { org }) : t("email.common.footerReport"),
    settings: org ? undefined : { label: t("email.common.settingsReport"), url: settingsUrl(i.appUrl) },
  });
  const text = [
    ...(org ? [t("email.weekly.textShared", { org, farm }), ""] : []),
    `Parte semanal de ${farm} (${i.from} al ${i.to})`,
    "",
    t("email.weekly.textRecords", { n: i.records, authors: i.authors }),
    t("email.weekly.textRain", { rain: i.rainMm !== null ? `${fmtNum(i.rainMm)} mm` : t("email.weekly.textNoData") }),
    t("email.weekly.textAlerts", { alerts: i.alerts.length ? i.alerts.map((a) => clip(a, 200)).join("; ") : t("email.weekly.textNone") }),
    t("email.weekly.textOverdue", { n: i.overdueTasks }),
    "",
    t("email.weekly.textPdf", { url: web }),
    ...(i.pdfUrl ? ["", t("email.weekly.textPdfValid", { url: i.pdfUrl })] : []),
    ...(org ? ["", t("email.common.footerExternal", { org })] : []),
  ].join("\n");
  return { subject, html, text, ...(org ? {} : { headers: unsubscribe(i.appUrl) }) };
}
