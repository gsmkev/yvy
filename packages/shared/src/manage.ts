/**
 * Lógica de las pantallas de oficina que comparten la web y la app: qué ve cada rol en el menú de gestión, fechas
 * límite en palabras, calendario semanal, motivo de un registro raro y cuentas de lluvia. Son funciones puras: lo que
 * decide el servidor (permisos, avisos, registros raros) llega por REST y acá solo se presenta.
 */
import type { ApiFarmClimate } from "./api-types";
import { type MessageKey, t } from "./i18n";
import type { Oddity } from "./oddities";
import { isFieldRole, type Role } from "./schema";
import { addDays } from "./tasks";

// ---------- menú de gestión por rol ----------

export type ManageId = "review" | "tasks" | "calendar" | "alerts" | "report" | "climate" | "team" | "clients";

export interface ManageItem {
  id: ManageId;
  label: MessageKey;
}
export interface ManageGroup {
  id: "decide" | "farm" | "people";
  label: MessageKey;
  items: ManageItem[];
}

/** La pestaña Gestión es de la oficina (dueño, administrador, agrónomo y supervisor); el empleado y el contratista no la ven. */
export const hasManageTab = (role: string | null | undefined): boolean => !!role && !isFieldRole(role);

/** Tablero con cifras de la organización y equipo con alta de personas: dueño y administrador (can.dashboard y can.manageWorkers del Worker). */
export const isAdminRole = (role: string | null | undefined): boolean => role === "owner" || role === "admin";

/**
 * Entradas de la pestaña Gestión. Solo decide qué se muestra: cada pantalla vuelve a pedir los datos al servidor, que
 * es quien aplica los permisos (`can` en apps/api/src/db/scoped.ts), así que un rol de más en este menú no abre nada.
 */
export function manageNav(c: { role: Role; organizations: number }): ManageGroup[] {
  if (!hasManageTab(c.role)) return [];
  const groups: ManageGroup[] = [
    {
      id: "decide",
      label: "app.manageGroupDecide",
      items: [
        { id: "alerts", label: "ui.navAlerts" },
        { id: "review", label: "ui.reviewTitle" },
        { id: "tasks", label: "ui.navTasks" },
        { id: "calendar", label: "ui.navCalendar" },
      ],
    },
    {
      id: "farm",
      label: "app.manageGroupFarm",
      items: [
        { id: "report", label: "ui.reportTitle" },
        { id: "climate", label: "app.manageClimate" },
      ],
    },
    {
      id: "people",
      label: "app.manageGroupPeople",
      items: [
        ...(isAdminRole(c.role) ? [{ id: "team" as const, label: "ui.navTeam" as MessageKey }] : []),
        ...(c.organizations > 1 ? [{ id: "clients" as const, label: "ui.navClients" as MessageKey }] : []),
      ],
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

// ---------- avisos ----------

const SEVERITY_RANK: Record<string, number> = { warning: 0, watch: 1, info: 2 };

/** Avisos: lo urgente arriba (alerta, atención, información) y, dentro de cada nivel, el más nuevo primero. */
export function sortAlerts<T extends { severity: string; validFrom: number }>(list: T[]): T[] {
  return list.slice().sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.validFrom - a.validFrom);
}

/** Un aviso está activo si no se resolvió y todavía no venció. */
export const isAlertActive = (a: { resolvedAt: number | null; validTo: number | null }, now: number): boolean => a.resolvedAt === null && (a.validTo === null || a.validTo >= now);

// ---------- fechas ----------

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Días de `iso` respecto de `today` (negativo = ya pasó). Ambos "AAAA-MM-DD". */
export const daysFrom = (today: string, iso: string): number => dayNum(iso) - dayNum(today);

/** "AAAA-MM-DD" a dd/mm/aaaa. */
export const isoToDmy = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Fecha límite en palabras cuando importa la urgencia; lejos, la fecha dd/mm/aaaa. */
export function dueLabel(iso: string, today: string, overdue = false): string {
  const n = daysFrom(today, iso);
  if (n === 0) return overdue ? t("ui.dueLateToday") : t("ui.dueToday");
  if (n === 1) return t("ui.dueTomorrow");
  if (n === -1) return t("ui.dueYesterday");
  if (n < 0) return t("ui.dueLateDays", { n: -n });
  if (n <= 6) return t("ui.dueInDays", { n });
  return isoToDmy(iso);
}

/** Lunes de la semana de `date` ("YYYY-MM-DD"). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `monday`. */
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * Labores agrupadas por día. Las canceladas no salen; dentro del día, primero las que tienen hora y después las del
 * día entero, por prioridad.
 */
export function tasksByDay<T extends { dueDate: string; dueTime: string | null; status: string; priority: string }>(
  tasks: T[],
  days: string[],
): Map<string, T[]> {
  const rank: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const out = new Map(days.map((d) => [d, [] as T[]]));
  for (const x of tasks) if (x.status !== "cancelled") out.get(x.dueDate)?.push(x);
  for (const list of out.values())
    list.sort((a, b) => (a.dueTime ?? "24:00").localeCompare(b.dueTime ?? "24:00") || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
  return out;
}

// ---------- registros raros ----------

const num = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 1 });

/** Por qué el servidor marcó un registro, en una frase (las reglas viven en oddities.ts y se evalúan en el Worker). */
export function oddityReason(o: Oddity): string {
  switch (o.rule) {
    case "rain_high":
      return t("ui.reviewRainHigh", { mm: num(o.mm), max: num(o.max) });
    case "pest_off_season":
      return t("ui.reviewPestOff", {
        pest: t(`fields.pest_${o.pest}` as MessageKey),
        month: new Date(Date.UTC(2026, o.month - 1, 1)).toLocaleDateString("es-PY", { month: "long", timeZone: "UTC" }),
      });
    case "dose_out_of_range": {
      const unit = o.baseUnit === "l" ? "l/ha" : "kg/ha";
      const range =
        o.min !== null && o.max !== null
          ? `${num(o.min)} a ${num(o.max)}`
          : o.min !== null
            ? `${t("ui.reviewAtLeast")} ${num(o.min)}`
            : `${t("ui.reviewUpTo")} ${num(o.max ?? 0)}`;
      return t("ui.reviewDose", { product: o.product || "—", dose: num(o.dose), unit: t(`fields.doseUnit_${o.unit}` as MessageKey), range: `${range} ${unit}` });
    }
    case "yield_impossible":
      return t("ui.reviewYield", { tha: num(o.tHa), crop: t(`fields.crop_${o.crop}` as MessageKey), max: num(o.max) });
  }
}

/** Para revisar: primero lo que puede costar plata (dosis, rinde), después lo que suele ser un error de carga. */
const ODDITY_RANK: Record<string, number> = { dose_out_of_range: 0, yield_impossible: 1, rain_high: 2, pest_off_season: 3 };

export function sortReview<T extends { capturedAt: number; oddities: { rule: string }[] }>(list: T[]): T[] {
  const rank = (x: T) => Math.min(...x.oddities.map((o) => ODDITY_RANK[o.rule] ?? 9), 9);
  return list.slice().sort((a, b) => rank(a) - rank(b) || b.capturedAt - a.capturedAt);
}

// ---------- lluvia ----------

/** Lluvia diaria de la estancia: CHIRPS final reemplaza a la preliminar del mismo día. */
export function rainByDate(daily: ApiFarmClimate["daily"]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of daily) {
    if (d.precipMm === null) continue;
    if (d.source === "chirps" || (d.source === "chirps_prelim" && !out.has(d.date))) out.set(d.date, d.precipMm);
  }
  return out;
}

/** Lluvia del satélite entre dos fechas (inclusive); null si no hay ningún dato en el período. */
export function rainBetween(daily: ApiFarmClimate["daily"], from: string, to: string): number | null {
  const byDate = new Map<string, number>();
  for (const d of daily) {
    if (d.date < from || d.date > to || d.precipMm === null) continue;
    if (d.source === "chirps" || !byDate.has(d.date)) byDate.set(d.date, d.precipMm);
  }
  return byDate.size ? [...byDate.values()].reduce((a, b) => a + b, 0) : null;
}

/** Suma de lluvia de pluviómetro entre dos instantes (epoch ms); null si no hay lecturas. */
export function gaugeBetween(gauge: { capturedAt: number; mm: number }[], fromMs: number, toMs: number): number | null {
  const inside = gauge.filter((g) => g.capturedAt >= fromMs && g.capturedAt <= toMs);
  return inside.length ? inside.reduce((a, g) => a + g.mm, 0) : null;
}

/** Inicio y fin del día (hora de Paraguay, UTC-3) de un "AAAA-MM-DD", en epoch ms. */
export const dayRangeMs = (from: string, to: string): [number, number] => [
  Date.parse(`${from}T00:00:00-03:00`),
  Date.parse(`${to}T23:59:59-03:00`),
];

export interface ClimateSummary {
  rain30: number | null;
  normal30: number | null;
  pctOfNormal: number | null;
  soilMoisture: number | null;
}

/** Cifras de la pestaña Clima: lluvia de los últimos 30 días contra lo normal y humedad del suelo más reciente. */
export function climateSummary(
  c: {
    daily: { date: string; source: string; precipMm: number | null; soilMoisture0_7?: number | null }[];
    climatology?: { dayOfYear: number; variable: string; mean: number | null }[];
  },
  today: string,
): ClimateSummary {
  const rain = rainByDate(c.daily);
  const normalByDoy = new Map((c.climatology ?? []).filter((x) => x.variable === "precip").map((x) => [x.dayOfYear, x.mean]));
  const doy = (date: string) => Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / 86_400_000) + 1;
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const has = last30.some((d) => rain.has(d));
  const rain30 = has ? last30.reduce((a, d) => a + (rain.get(d) ?? 0), 0) : null;
  const normal = last30.reduce((a, d) => a + (normalByDoy.get(doy(d)) ?? 0), 0);
  const soil = [...c.daily].reverse().find((d) => d.soilMoisture0_7 != null)?.soilMoisture0_7 ?? null;
  return {
    rain30,
    normal30: normal > 0 ? normal : null,
    pctOfNormal: rain30 !== null && normal > 0 ? Math.round((rain30 / normal) * 100) : null,
    soilMoisture: soil,
  };
}
