/**
 * I-04: iCalendar (RFC 5545) mínimo y sin dependencias. Solo arma texto: nada de Intl ni de zonas horarias calculadas
 * (10 ms de CPU). Las tareas con hora llevan `TZID=<zona de la estancia>` y la hora local tal cual.
 */

/** Escapa un valor de texto (RFC 5545 §3.3.11). */
export const icsText = (v: string): string =>
  v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const enc = new TextEncoder();

/** Dobla una línea a 75 octetos sin partir un carácter UTF-8 (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // las continuaciones arrancan con un espacio
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface IcsEvent {
  uid: string;
  /** Marca de creación en epoch ms (DTSTAMP). */
  stamp: number;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" hora local de `tz`, o null = todo el día. */
  time: string | null;
  tz: string;
  summary: string;
  description?: string;
  /** 1 (alta) a 9 (baja). */
  priority?: number;
  geo?: { lat: number; lon: number };
  url?: string;
}

const compactDate = (d: string) => d.replace(/-/g, "");
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const nextDay = (d: string): string => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
};

/** Una hora más, para el fin de un evento con hora (HH:MM; si pasa de medianoche queda en 23:59). */
const plusHour = (t: string): string => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export function buildCalendar(name: string, events: IcsEvent[], prodId = "-//Yvy//Tareas//ES"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(e.stamp)}`);
    if (e.time) {
      const t = (v: string) => `${compactDate(e.date)}T${v.replace(":", "")}00`;
      lines.push(`DTSTART;TZID=${e.tz}:${t(e.time)}`, `DTEND;TZID=${e.tz}:${t(plusHour(e.time))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(e.date))}`);
    }
    lines.push(`SUMMARY:${icsText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.priority) lines.push(`PRIORITY:${e.priority}`);
    if (e.geo) lines.push(`GEO:${e.geo.lat.toFixed(6)};${e.geo.lon.toFixed(6)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
