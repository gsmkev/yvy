/**
 * Calendario oficial de SENACSA: campañas de vacunación obligatorias.
 *
 * LAS FECHAS LAS FIJA CADA AÑO UNA RESOLUCIÓN DE SENACSA Y SUELEN PRORROGARSE: son datos, no lógica. Se actualizan
 * con un cambio de código (si cambian más de dos veces por año, pasar a una tabla editable en /interno).
 * Fuente 2026: calendario de vacunación contra la fiebre aftosa y brucelosis de SENACSA (senacsa.gov.py).
 * El país planea dejar de vacunar contra la aftosa (2027-2028): para 2027 se carga lo que publique SENACSA y la
 * lista puede quedar sin aftosa sin tocar el resto. Orientativo: confirmá siempre con la resolución vigente.
 */
import type { HealthReason, HerdCategory } from "./livestock";

/** Fuente que se muestra junto a las campañas oficiales. */
export const SENACSA_SOURCE = "SENACSA, calendario oficial de vacunación";
/** Sitio oficial de SENACSA. */
export const SENACSA_URL = "https://www.senacsa.gov.py";

/** Campaña oficial de vacunación obligatoria con sus fechas de apertura y cierre. */
export interface SenacsaCampaign {
  /** Estable: `senacsa-<año>-<período>-<motivo>`. */
  id: string;
  year: number;
  period: 1 | 2;
  reason: Extract<HealthReason, "aftosa" | "brucelosis">;
  /** "YYYY-MM-DD": apertura y cierre de la vacunación. */
  from: string;
  to: string;
  /** Fecha límite para registrar la vacunación ante SENACSA, si es posterior al cierre. */
  registerUntil?: string;
  /** Categorías alcanzadas (vacío = toda la hacienda bovina). */
  categories: HerdCategory[];
  /** Texto de a quién alcanza (es-PY). */
  appliesTo: string;
  /** Aclaración sobre las fechas (prórrogas, día exacto sin confirmar). */
  note?: string;
  source: string;
}

const AFTOSA = "Todo el rodeo bovino";
const BRUCELOSIS = "Terneras de 3 a 8 meses";

const camp = (
  year: number,
  period: 1 | 2,
  reason: SenacsaCampaign["reason"],
  w: Pick<SenacsaCampaign, "from" | "to" | "registerUntil" | "note">,
): SenacsaCampaign => ({
  id: `senacsa-${year}-${period}-${reason}`,
  year,
  period,
  reason,
  categories: reason === "aftosa" ? [] : ["ternero"],
  appliesTo: reason === "aftosa" ? AFTOSA : BRUCELOSIS,
  source: SENACSA_SOURCE,
  ...w,
});

const P1_2026 = { from: "2026-02-17", to: "2026-03-28", registerUntil: "2026-04-04" } as const;
const P2_2026 = {
  from: "2026-05-01",
  to: "2026-06-26",
  note: "Segundo período prorrogado hasta el 26/06; el día de apertura es el 1 de mayo si la resolución no indica otro.",
} as const;

/** Campañas cargadas por año. Para 2027 en adelante: agregar lo que publique SENACSA. */
export const SENACSA_CAMPAIGNS: readonly SenacsaCampaign[] = [
  camp(2026, 1, "aftosa", P1_2026),
  camp(2026, 1, "brucelosis", P1_2026),
  camp(2026, 2, "aftosa", P2_2026),
  camp(2026, 2, "brucelosis", P2_2026),
];

/** Campañas oficiales de un año para una estancia. Sin hacienda no hay campañas. */
export function officialCampaigns(year: number, farm: { hasLivestock: boolean }): SenacsaCampaign[] {
  if (!farm.hasLivestock) return [];
  return SENACSA_CAMPAIGNS.filter((c) => c.year === year);
}

// ---------- recordatorios ----------

/** Tipos de recordatorio de una campaña: aviso previo, apertura y última semana. */
export const SENACSA_REMINDER_TYPES = ["before", "open", "closing"] as const;
/** Tipo de recordatorio de una campaña. */
export type SenacsaReminderType = (typeof SENACSA_REMINDER_TYPES)[number];

/** Días antes de la apertura en que sale el aviso previo. */
export const SENACSA_BEFORE_DAYS = 14;
/** Días antes del cierre en que sale el aviso de última semana. */
export const SENACSA_CLOSING_DAYS = 7;

/** Recordatorio de una campaña que toca avisar. */
export interface SenacsaReminder {
  /** Una clave por estancia: `<período>:<tipo>`, la usa el aviso para no repetirse. */
  key: string;
  type: SenacsaReminderType;
  year: number;
  period: 1 | 2;
  /** Campañas del período que entran en este aviso (en el de cierre, solo las que faltan vacunar). */
  campaigns: SenacsaCampaign[];
  /** Ventana del aviso (estable día a día para que no se reescriba). */
  validFrom: string;
  validTo: string;
}

const MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * MS).toISOString().slice(0, 10);

/** ¿Alguna campaña puede dar un aviso hoy? Sirve para salir antes de consultar la base. */
export function senacsaReminderWindow(campaigns: readonly SenacsaCampaign[], today: string): boolean {
  return campaigns.some((c) => today >= addDays(c.from, -SENACSA_BEFORE_DAYS) && today <= c.to);
}

/**
 * Avisos que corresponden hoy para una estancia con hacienda. Función pura (el cron la llama a diario y la clave
 * evita repetir): 14 días antes de abrir, al abrir y 7 días antes del cierre si no se registró la vacunación.
 * `vaccinated(reason, c)` dice si la estancia ya registró la vacunación de esa campaña.
 */
export function senacsaReminders(
  campaigns: readonly SenacsaCampaign[],
  today: string,
  vaccinated: (c: SenacsaCampaign) => boolean = () => false,
): SenacsaReminder[] {
  const out: SenacsaReminder[] = [];
  const periods = new Map<string, SenacsaCampaign[]>();
  for (const c of campaigns) periods.set(`${c.year}-${c.period}`, [...(periods.get(`${c.year}-${c.period}`) ?? []), c]);
  for (const [, group] of periods) {
    const first = group[0]!;
    const from = group.reduce((m, c) => (c.from < m ? c.from : m), first.from);
    const to = group.reduce((m, c) => (c.to > m ? c.to : m), first.to);
    const base = { year: first.year, period: first.period };
    if (today >= addDays(from, -SENACSA_BEFORE_DAYS) && today < from)
      out.push({ ...base, key: `${first.year}-${first.period}:before`, type: "before", campaigns: group, validFrom: addDays(from, -SENACSA_BEFORE_DAYS), validTo: from });
    if (today >= from && today <= to)
      out.push({ ...base, key: `${first.year}-${first.period}:open`, type: "open", campaigns: group, validFrom: from, validTo: to });
    if (today >= addDays(to, -SENACSA_CLOSING_DAYS) && today <= to) {
      const missing = group.filter((c) => !vaccinated(c));
      if (missing.length)
        out.push({ ...base, key: `${first.year}-${first.period}:closing`, type: "closing", campaigns: missing, validFrom: addDays(to, -SENACSA_CLOSING_DAYS), validTo: to });
    }
  }
  return out;
}

/** Fecha sugerida para planificar una campaña: hoy si ya abrió, la apertura si todavía no. */
export const senacsaPlanDate = (c: SenacsaCampaign, today: string): string => (today > c.from ? today : c.from);

/** Marca que lleva la nota del evento sanitario creado desde una campaña oficial (así se sabe cuáles ya se planificaron). */
export const SENACSA_NOTE_PREFIX = "Oficial · SENACSA";
/** Nota que identifica un evento sanitario creado desde la campaña `c`. */
export const senacsaNote = (c: SenacsaCampaign): string => `${SENACSA_NOTE_PREFIX} · ${c.id}`;
/** Id de la campaña oficial que figura en la nota de un evento; null si no es de una campaña. */
export const senacsaIdFromNote = (note: string | null | undefined): string | null => /senacsa-\d{4}-[12]-[a-z]+/.exec(note ?? "")?.[0] ?? null;

/** Respuesta de GET /org/senacsa?year=: campañas del año (vacío si la organización no registró hacienda) y las ya planificadas. */
/** Respuesta del calendario oficial de un año. */
export interface SenacsaResponse {
  campaigns: SenacsaCampaign[];
  planned: string[];
}
