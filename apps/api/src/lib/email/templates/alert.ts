/** Correo de aviso agronómico: panel oscuro con el dato, widgets del tipo en la tarjeta, "qué hacer" y botón al mapa. */
import { ATTRIBUTION, localDate, safeHtml, t, tk } from "@yvy/shared";
import { clip, renderLayout } from "../layout";
import { base, dm, settingsUrl, unsubscribe, type EmailMessage } from "../message";
import { bullets, button, chip, gap, h2, heroTitle, type Tone } from "../widgets";
import { KIND_COMPOSERS, type AlertContext, type Composition } from "./alert-kinds";
import { obj } from "./data";

export type { AlertContext, DayForecast, HourForecast, PlotInfo } from "./alert-kinds";

/** Datos de un aviso agronómico para el correo. */
export interface AlertEmailInput {
  kind: string;
  severity: "info" | "watch" | "warning";
  probability: string | null;
  summary: string;
  /** Detalle del aviso (JSON de la base ya parseado o en texto). */
  details: unknown;
  /** Inicio y fin de la vigencia, en epoch ms. */
  validFrom: number | null;
  validTo: number | null;
  farmId: string;
  farmName: string;
  /** Localidad de la estancia (distrito o departamento). */
  place?: string | null;
  tz: string;
  source: string;
  appUrl: string;
  /** Pronóstico, lotes y lluvia observada leídos al enviar; sin él el aviso sale solo con lo que trae. */
  context?: AlertContext;
}

const TONE: Record<AlertEmailInput["severity"], Tone> = { warning: "bad", watch: "warn", info: "neutral" };
const FORECAST_KINDS = new Set(["frost", "excess_rain", "heat_stress", "rust_risk"]);

/** Crédito de los datos en el pie: una sola atribución por aviso. */
function credit(i: AlertEmailInput): string {
  if (FORECAST_KINDS.has(i.kind)) return t("email.common.creditForecast", { credit: t(ATTRIBUTION.metNorway) });
  return t("email.common.credit", { credit: i.kind === "fire" ? `Datos de ${t(ATTRIBUTION.firms)}` : `Fuente: ${clip(i.source, 60)}` });
}

/** Compone el aviso; si faltan datos del tipo cae a titular y frase genéricos con la vigencia. */
function compose(i: AlertEmailInput, ctx: AlertContext): Composition & { headline: string } {
  const today = localDate(ctx.now, i.tz);
  const made = KIND_COMPOSERS.get(i.kind)?.({ d: obj(i.details), ctx, tz: i.tz, summary: clip(i.summary, 400), today });
  const range =
    i.validFrom !== null && i.validTo !== null
      ? t("email.alert.lead_validity", { from: dm(localDate(i.validFrom, i.tz)), to: dm(localDate(i.validTo, i.tz)) })
      : undefined;
  return {
    headline: made?.headline ?? tk(`email.alert.title_${i.kind}`),
    lead: made?.lead ?? (clip(i.summary, 400) || range),
    hero: made?.hero ?? [],
    body: made?.body ?? [],
  };
}

/** Aviso agronómico completo: pastilla de severidad, panel con el dato, widgets por tipo y botón al mapa. */
export function alertEmail(i: AlertEmailInput): EmailMessage {
  const farm = clip(i.farmName, 120);
  const ctx = i.context ?? { now: Date.now(), days: [], hours: [], plots: [], rainDaily: [] };
  const c = compose(i, ctx);
  const subject = t("email.alert.subject", { headline: c.headline, farm });
  const prob = i.probability ? `, ${tk(`email.alert.prob_${i.probability}`)}` : "";
  const label = `${tk(`ui.severity.${i.severity}`)}: ${tk(`email.alert.title_${i.kind}`).toLowerCase()}${prob}`;
  const url = `${base(i.appUrl)}/estancias/${encodeURIComponent(i.farmId)}`;
  const todo = [1, 2, 3].map((n) => tk(`email.alert.todo_${i.kind}_${n}`));
  const todoTitle = tk(`email.alert.todoTitle_${i.kind}`);
  const creditLine = credit(i);
  if (c.body[0]?.text === gap(24).text) c.body.shift();
  const html = renderLayout({
    subject,
    preheader: todo[0]!,
    place: i.place ? `${farm}, ${clip(i.place, 60)}` : farm,
    hero: safeHtml`${heroTitle(chip(label, TONE[i.severity]), c.headline, c.lead)}${c.hero}`,
    body: safeHtml`${c.body}${c.body.length ? gap(24) : ""}${h2(todoTitle, "0 0 6px")}${bullets(todo)}${button(url, t("email.common.viewMap"))}`,
    footer: t("email.common.footerAlerts", { farm }),
    settings: { label: t("email.common.settings"), url: settingsUrl(i.appUrl) },
    credit: creditLine,
  });
  const text = [
    `${c.headline}: ${farm}`,
    "",
    ...(c.lead ? [c.lead, ""] : []),
    todoTitle,
    ...todo.map((l) => `- ${l}`),
    "",
    `${t("email.common.viewMap")}: ${url}`,
    "",
    creditLine,
    `${t("email.common.settings")}: ${settingsUrl(i.appUrl)}`,
  ].join("\n");
  return { subject, html, text, headers: unsubscribe(i.appUrl) };
}
