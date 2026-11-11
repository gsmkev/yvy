/** Compartir por WhatsApp (K-10, K-11): armado del texto y del enlace wa.me. Lo usan la web y la app. */
import { t } from "./i18n";

/** Enlace de Google Maps a un punto. */
export const mapsLink = (lat: number, lon: number): string =>
  `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;

/** wa.me sin número: WhatsApp deja elegir con quién compartir. */
export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

export interface RecordShareInput {
  kindLabel: string;
  description: string;
  plotName?: string | null;
  farmName?: string | null;
  /** Fecha ya formateada para mostrar. */
  when: string;
  lat?: number | null;
  lon?: number | null;
}

export function recordShareText(x: RecordShareInput): string {
  const lines = [`*${x.kindLabel}* · ${x.when}`, x.description];
  const where = [
    x.plotName ? `${t("ui.plot")}: ${x.plotName}` : null,
    x.farmName ? `${t("ui.farm")}: ${x.farmName}` : null,
  ].filter(Boolean);
  if (where.length) lines.push(where.join(" · "));
  if (x.lat != null && x.lon != null) lines.push(`${t("ui.location")}: ${mapsLink(x.lat, x.lon)}`);
  lines.push("", t("ui.shareSignature"));
  return lines.join("\n");
}

export interface AlertShareInput {
  kindLabel: string;
  severityLabel: string;
  summary: string;
  farmName?: string | null;
  /** Texto de vigencia ya formateado. */
  validity: string;
  link: string;
}

export function alertShareText(x: AlertShareInput): string {
  const lines = [`*${x.kindLabel}* (${x.severityLabel})`, x.summary];
  if (x.farmName) lines.push(`${t("ui.farm")}: ${x.farmName}`);
  lines.push(x.validity, t("ui.shareAlertOrientative"), "", `${t("ui.shareSeeInApp")}: ${x.link}`);
  return lines.join("\n");
}

export interface WeeklyShareInput {
  farmName: string;
  from: string;
  to: string;
  records: number;
  workers: number;
  rainMm: number | null;
  alerts: string[];
  link: string;
}

export function weeklyShareText(x: WeeklyShareInput): string {
  const lines = [
    `*${t("ui.reportTitle")} · ${x.farmName}*`,
    `${x.from} – ${x.to}`,
    `${t("ui.navRecords")}: ${x.records} (${x.workers} ${t("ui.workers").toLowerCase()})`,
    `${t("ui.rainWeek")}: ${x.rainMm === null ? "—" : `${Math.round(x.rainMm)} mm`}`,
    `${t("ui.alertsTitle")}: ${x.alerts.length ? x.alerts.join("; ") : t("ui.shareNoAlerts")}`,
    "",
    `${t("ui.shareSeeInApp")}: ${x.link}`,
  ];
  return lines.join("\n");
}
