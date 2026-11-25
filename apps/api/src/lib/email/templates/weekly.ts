/** Parte semanal de una estancia: cifras con variación, lluvia por día, registros por tipo, lotes que perdieron vigor y tareas. */
import { t, tk } from "@yvy/shared";
import { C, clip, renderLayout } from "../layout";
import { base, dm, settingsUrl, unsubscribe, weekdayShort, type EmailMessage } from "../message";
import { barChart, compareBars, fmtNum, kpiRow, paragraph, plotList, progress, sectionTitle, type Delta, type Kpi } from "../widgets";
import { plotColor } from "./data";

/** Lote cuyo vigor (NDVI medio) bajó entre las dos últimas escenas. */
export interface WorsenedPlot {
  name: string;
  crop: string | null;
  kind: string;
  from: number;
  to: number;
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
  prevRainMm?: number | null;
  /** Lluvia de cada día de la semana. */
  rainDaily?: { date: string; mm: number }[];
  /** Resúmenes de los avisos de la semana. */
  alerts: string[];
  overdueTasks: number;
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

const pct = (now: number, prev: number | null | undefined): Delta | undefined => {
  if (prev == null || prev <= 0) return undefined;
  const d = Math.round(((now - prev) / prev) * 100);
  return { text: `${Math.abs(d)} % ${t("email.weekly.vsPrev")}`, tone: d === 0 ? "flat" : d > 0 ? "good" : "bad" };
};

/** Fecha ISO sumando días (UTC). */
const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function kpis(i: WeeklyEmailInput): Kpi[] {
  const rainDelta: Delta | undefined =
    i.rainMm !== null && i.prevRainMm != null && i.prevRainMm > 0
      ? { text: `${Math.abs(Math.round(i.rainMm - i.prevRainMm))} mm ${t("email.weekly.vsPrev")}`, tone: "flat" }
      : undefined;
  return [
    { label: t("email.weekly.records"), value: String(i.records), delta: pct(i.records, i.prevRecords) },
    { label: t("email.weekly.rain"), value: i.rainMm !== null ? fmtNum(i.rainMm) : "-", unit: i.rainMm !== null ? "mm" : undefined, delta: rainDelta },
    { label: t("email.weekly.alerts"), value: String(i.alerts.length) },
    { label: t("email.weekly.overdue"), value: String(i.overdueTasks) },
  ];
}

function blocks(i: WeeklyEmailInput) {
  const days = Array.from({ length: 7 }, (_, n) => addDays(i.from, n)).filter((d) => d <= i.to);
  const rain = new Map((i.rainDaily ?? []).map((r) => [r.date, r.mm]));
  const top = [...i.byKind].sort((a, b) => b.n - a.n).slice(0, 6);
  return [
    ...((i.rainDaily?.length ?? 0) > 0
      ? [
          sectionTitle(t("email.weekly.rainChart")),
          barChart({
            bars: days.map((d) => ({ label: weekdayShort(d), value: Math.round(rain.get(d) ?? 0), strong: (rain.get(d) ?? 0) >= 20 })),
            legend: [
              { color: C.skyDark, text: t("email.weekly.rainLegendStrong") },
              { color: C.sky, text: t("email.weekly.rainLegendLight") },
            ],
          }),
        ]
      : []),
    ...(top.length
      ? [
          sectionTitle(t("email.weekly.byKind")),
          compareBars(top.map((k, n) => ({ label: clip(tk(`record-kinds.kind.${k.kind}`), 24), value: k.n, display: String(k.n), color: n === 0 ? C.soyDark : C.soy, strong: n === 0 }))),
        ]
      : []),
    ...((i.worsened?.length ?? 0) > 0
      ? [
          sectionTitle(t("email.weekly.worse")),
          plotList(
            (i.worsened ?? []).slice(0, 5).map((w) => ({
              color: plotColor(w.crop, w.kind),
              name: w.name,
              detail: t("email.weekly.worseDetail", { from: fmtNum(w.from, 2), to: fmtNum(w.to, 2) }),
              value: fmtNum(w.to - w.from, 2),
            })),
          ),
        ]
      : []),
    ...((i.tasksTotal ?? 0) > 0
      ? [
          sectionTitle(t("email.weekly.tasks")),
          progress({ label: t("email.weekly.tasks"), display: t("email.weekly.tasksDisplay", { done: i.tasksDone ?? 0, total: i.tasksTotal ?? 0 }), value: i.tasksDone ?? 0, max: i.tasksTotal ?? 1 }),
        ]
      : []),
    ...(i.alerts.length ? [sectionTitle(t("email.weekly.alertsTitle")), plotList(i.alerts.slice(0, 4).map((a) => ({ color: C.wheat, name: clip(a, 160), value: "" })))] : []),
    paragraph(i.hasPdf ? t("email.weekly.pdfAttached") : t("email.weekly.pdfLater"), true),
  ];
}

/** Parte semanal; la variante externa no lleva enlaces que pidan sesión ni ajustes de avisos. */
export function weeklyEmail(i: WeeklyEmailInput): EmailMessage {
  const farm = clip(i.farmName, 120);
  const org = i.externalOrg ? clip(i.externalOrg, 120) : "";
  const subject = org ? t("email.weekly.subjectExternal", { farm, org }) : t("email.weekly.subject", { farm });
  const web = `${base(i.appUrl)}/estancias/${encodeURIComponent(i.farmId)}/parte?desde=${i.from}&hasta=${i.to}`;
  const rain = i.rainMm !== null ? `${fmtNum(i.rainMm)} mm` : t("email.weekly.noRain");
  const lead = t("email.weekly.lead", { from: dm(i.from), to: dm(i.to), records: i.records, rain, alerts: i.alerts.length });
  const html = renderLayout({
    subject,
    preheader: t("email.weekly.preheader"),
    band: t("email.common.bandWeekly", { from: dm(i.from), to: dm(i.to) }),
    strip: { color: C.soy, text: t("email.weekly.strip") },
    context: org ? t("email.weekly.fromOrg", { org }) : undefined,
    title: t("email.weekly.title", { farm }),
    lead,
    blocks: [kpiRow(kpis(i)), ...blocks(i)],
    cta: org ? undefined : { label: t("email.weekly.open"), url: web },
    footer: org ? t("email.common.footerExternal", { org }) : t("email.common.footerReport"),
    settings: org ? undefined : { label: t("email.common.settings"), url: settingsUrl(i.appUrl) },
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
