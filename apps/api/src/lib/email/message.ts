/** Tipo del correo ya armado y utilidades comunes de las plantillas (enlaces a la app, fechas en es-PY). */
import { localDate } from "@yvy/shared";

/** Correo listo para enviar: siempre multiparte (HTML y texto). */
export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
  /** Encabezados extra (por ejemplo `List-Unsubscribe`). */
  headers?: Record<string, string>;
}

/** Dirección de la app sin barra final. */
export const base = (appUrl: string): string => appUrl.replace(/\/$/, "");
/** Ajustes de avisos en la web. */
export const settingsUrl = (appUrl: string): string => `${base(appUrl)}/cuenta`;
/** Encabezado `List-Unsubscribe` hacia los ajustes de avisos. */
export const unsubscribe = (appUrl: string): Record<string, string> => ({ "List-Unsubscribe": `<${settingsUrl(appUrl)}>` });

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const dayOfWeek = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Día y mes (dd/mm) de una fecha ISO. */
export const dm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Día de la semana abreviado de una fecha ISO ("mié"). */
export const weekdayShort = (iso: string): string => WEEKDAY[dayOfWeek(iso)]!;
/** Día de la semana completo de una fecha ISO ("miércoles"). */
export const weekdayLong = (iso: string): string => WEEKDAY_LONG[dayOfWeek(iso)]!;
/** Fecha larga de un instante en la hora de la estancia ("miércoles 25 de noviembre"). */
export const longDate = (ms: number, tz: string): string => {
  const iso = localDate(ms, tz);
  return `${weekdayLong(iso)} ${Number(iso.slice(8, 10))} de ${MONTH[Number(iso.slice(5, 7)) - 1]}`;
};
