/**
 * Una muestra de cada plantilla con datos de ejemplo completos. Salen de las mismas funciones que arman el envío
 * real, así que lo que se prueba es lo que se manda. Las usan la vista previa local y la prueba del panel interno.
 */
import { ALERT_KINDS, localDate, safeHtml, t, type FarmRisk } from "@yvy/shared";
import {
  alertEmail,
  deleteRequestEmail,
  leadEmail,
  loginCodeEmail,
  mentionEmail,
  planRequestEmail,
  trialRequestEmail,
  usageEmail,
  weeklyEmail,
  type AlertContext,
  type AlertEmailInput,
  type EmailMessage,
  type WeeklyEmailInput,
} from "./templates";

const DAY = 86_400_000;
const TZ = "America/Asuncion";
const FARM_ID = "00000000-0000-7000-8000-000000000001";

const PLOTS = [
  { id: "p4", name: "Lote 4 Soja", crop: "Soja", kind: "crop", areaHa: 57.8, sowingDate: "2026-10-04" },
  { id: "p2", name: "Lote 2 Maíz", crop: "Maíz", kind: "crop", areaHa: 15.4, sowingDate: "2026-09-20" },
  { id: "p3", name: "Lote 3 Trigo", crop: "Trigo", kind: "crop", areaHa: 29.9, sowingDate: "2026-06-10" },
  { id: "pn", name: "Potrero Norte", crop: null, kind: "pasture", areaHa: 120 },
];

/** Pronóstico, horas, lotes y lluvia observada de ejemplo, con una noche fría y un día de lluvia fuerte. */
function sampleContext(now: number, hot = false): AlertContext {
  const iso = (n: number) => localDate(now + n * DAY, TZ);
  const rain = [18, 38, 33, 6, 0, 2, 12];
  const tmax = [27, 24, 22, 25, 28, 30, 31];
  const tmin = [16, 15, 14, 12, 13, 15, 17];
  const start = Math.floor(now / 3_600_000) * 3_600_000;
  return {
    now,
    days: rain.map((rainMm, n) => ({ date: iso(n), tmin: tmin[n]!, tmax: tmax[n]!, rainMm })),
    hours: Array.from({ length: 48 }, (_, h) => {
      const at = start + h * 3_600_000;
      const local = (new Date(at).getUTCHours() + 21) % 24;
      return { at, tempC: Math.round(((hot ? 25 : 7) + 8 * Math.sin(((local - 9) / 24) * 2 * Math.PI)) * 10) / 10, humidityPct: 70 };
    }),
    plots: PLOTS,
    rainDaily: Array.from({ length: 30 }, (_, i) => ({ date: iso(i - 30), mm: i % 7 === 2 ? 3 : i % 11 === 0 ? 5 : 0 })),
  };
}

/** Aviso de ejemplo de cada tipo, con la severidad y el detalle que arma el job que lo genera. */
function alertSamples(appUrl: string, now: number): AlertEmailInput[] {
  const day = (n: number) => localDate(now + n * DAY, TZ);
  const base = {
    farmId: FARM_ID,
    farmName: "Estancia San Pedro",
    place: "Hohenau",
    tz: TZ,
    appUrl,
    context: sampleContext(now),
    validFrom: Date.parse(`${day(0)}T00:00:00-03:00`),
    validTo: Date.parse(`${day(2)}T23:59:59-03:00`),
    probability: null as string | null,
  };
  const by: Record<(typeof ALERT_KINDS)[number], Omit<AlertEmailInput, keyof typeof base>> = {
    frost: {
      kind: "frost",
      severity: "warning",
      summary: "Posible helada: mínima de -1,0 °C",
      source: "MET Norway",
      details: { days: [0, 1, 2].map((n, i) => ({ date: day(n + 1), tminC: [-1, 0.8, 2.1][i] })) },
    },
    excess_rain: {
      kind: "excess_rain",
      severity: "watch",
      summary: "Exceso de lluvia: 89 mm pronosticados (72 h)",
      source: "MET Norway",
      details: { mm: 89, window: "72h", days: [] },
    },
    drought: {
      kind: "drought",
      severity: "watch",
      summary: "Sequía: 35 % de la lluvia normal en 30 días y suelo seco",
      source: "CHIRPS",
      details: { rain30: 42, normal30: 120, soilNow: 0.18, soilP20: 0.22 },
    },
    fire: {
      kind: "fire",
      severity: "warning",
      summary: "Foco de calor a 3,2 km de la estancia, con viento hacia el campo",
      source: "NASA FIRMS",
      details: { minDistanceKm: 3.2, windTowardsFarm: true, hotspots: 4 },
    },
    pest_threshold: {
      kind: "pest_threshold",
      severity: "watch",
      summary: "Chinche: promedio de 3,4 por metro en Lote 4 Soja, sobre el umbral de 2",
      source: "Registros de campo",
      details: { hits: [{ plotId: "p4", pest: "chinche", avg: 3.4, threshold: 2 }, { plotId: "p3", pest: "oruga", avg: 2.3, threshold: 2 }] },
    },
    water_low: {
      kind: "water_low",
      severity: "warning",
      summary: "Tajamar Norte seca (y 1 más)",
      source: "Registros de campo",
      details: {
        pois: [
          { name: "Tajamar Norte", level: "dry", capturedAt: now - 2 * DAY },
          { name: "Aguada del monte", level: "low", capturedAt: now - 5 * DAY },
        ],
      },
    },
    heat_stress: {
      kind: "heat_stress",
      severity: "warning",
      summary: "Calor intenso para el ganado: THI de hasta 86 (emergencia)",
      source: "MET Norway",
      details: { maxThi: 86, dangerHours: 7, emergencyHours: 3 },
    },
    rust_risk: {
      kind: "rust_risk",
      severity: "watch",
      summary: "Riesgo de roya asiática en soja: hasta 11 horas de hoja mojada",
      source: "MET Norway",
      details: {
        wetHoursByDay: [4, 7, 11, 9, 3].map((wetHours, i) => ({ date: day(i), wetHours })),
        thresholds: { watchHours: 6, warningHours: 10 },
      },
    },
    senacsa: {
      kind: "senacsa",
      severity: "info",
      summary: "Abrió la campaña oficial de SENACSA: vacunación contra aftosa, hasta el 30/11.",
      source: "SENACSA",
      details: { type: "open", from: day(-12), to: day(5) },
    },
  };
  const hot = sampleContext(now, true);
  const fireCtx: AlertContext = {
    ...base.context,
    plots: PLOTS.map((p, i) => ({ ...p, distKm: [3.2, 5.8, 9.1, 14.6][i] })),
    hotspotsByDay: [0, 0, 1, 0, 0, 1, 2].map((n, i) => ({ date: day(i - 6), n })),
  };
  return ALERT_KINDS.map((k) => ({ ...base, context: k === "heat_stress" ? hot : k === "fire" ? fireCtx : base.context, probability: k === "frost" ? "high" : k === "excess_rain" ? "medium" : null, ...by[k] }));
}

/** Parte semanal de ejemplo. */
function weeklySample(appUrl: string, now: number): Omit<WeeklyEmailInput, "externalOrg"> {
  return {
    farmId: FARM_ID,
    farmName: "Estancia San Pedro",
    from: localDate(now - 7 * DAY, TZ),
    to: localDate(now - DAY, TZ),
    records: 128,
    authors: 5,
    prevRecords: 104,
    rainMm: 34,
    rainDaily: [0, 0, 22, 8, 0, 4, 0].map((mm, n) => ({ date: localDate(now - (7 - n) * DAY, TZ), mm })),
    alerts: ["Posible helada: mínima de -1,0 °C", "Exceso de lluvia: 89 mm pronosticados (72 h)"],
    overdueTasks: 3,
    tasksDone: 9,
    tasksTotal: 14,
    byKind: [
      { kind: "scouting", n: 46 },
      { kind: "rain", n: 28 },
      { kind: "pest", n: 21 },
      { kind: "herd_count", n: 18 },
      { kind: "health", n: 11 },
      { kind: "note", n: 9 },
    ],
    worsened: [
      { name: "Lote 4 Soja", from: 0.72, to: 0.58, series: [0.7, 0.74, 0.76, 0.75, 0.72, 0.58] },
      { name: "Lote 3 Trigo", from: 0.66, to: 0.42, series: [0.6, 0.64, 0.66, 0.66, 0.62, 0.42] },
    ],
    hasPdf: true,
    appUrl,
  };
}

/** Informe de riesgo de ejemplo para el correo de leads. */
const RISK: FarmRisk = {
  version: 1,
  generatedAt: 1_760_000_000_000,
  normalFrom: 1996,
  normalTo: 2025,
  frost: {
    thresholdC: 2,
    perYear: Array.from({ length: 24 }, (_, i) => ({ year: 2002 + i, days: [3, 6, 2, 8, 4, 5, 1, 7, 4, 3, 6, 9][i % 12]! })),
    meanPerYear: 4.8,
    worst: { year: 2011, days: 9 },
    yearsWithFrostPct: 88,
    typicalFirstFrost: "06-02",
    typicalLastFrost: "09-04",
  },
  rain: {
    annualMeanMm: 1420,
    normal: [150, 135, 120, 160, 120, 90, 70, 60, 110, 170, 160, 175].map((meanMm, i) => ({ month: i + 1, meanMm, p20Mm: meanMm * 0.6, p80Mm: meanMm * 1.4 })),
    recent: [],
  },
  dry: { thresholdMm: 1, meanLongestDays: 14, worst: { year: 2020, days: 38 }, spells15PerYear: 1.2, summerMeanLongestDays: 9 },
  fire: { radiusKm: 25, years: 10, total: 143, perYear: [], byMonth: [2, 1, 3, 4, 5, 12, 25, 40, 30, 12, 6, 3], nearestKm: 3.4, lastAt: 1_759_000_000_000, source: "NASA FIRMS" },
};

/** Todas las plantillas (todos los tipos y variantes) con datos de ejemplo, con el asunto prefijado con "[Prueba]". */
export function emailSamples(appUrl: string, now = Date.now()): EmailMessage[] {
  const weekly = weeklySample(appUrl, now);
  const all: EmailMessage[] = [
    loginCodeEmail({ code: "482915", minutes: 10, now }),
    ...alertSamples(appUrl, now).map(alertEmail),
    mentionEmail({
      author: "Ramón Benítez",
      body: "Pasé por el lote 4 y las hojas de abajo ya tienen manchas.\n¿Podés mirarlo mañana temprano?",
      appUrl,
      now,
      record: { kind: "pest", farmName: "Estancia San Pedro", plotName: "Lote 4 Soja", capturedAt: now - DAY },
    }),
    weeklyEmail(weekly),
    weeklyEmail({ ...weekly, externalOrg: "Estancias del Norte S.A." }),
    leadEmail({ link: `${appUrl.replace(/\/$/, "")}/informe/00000000-0000-7000-8000-000000000002/firma`, days: 90, report: RISK }),
    usageEmail({ rows: [{ metric: "d1_bytes", pct: 82 }, { metric: "r2_photo_bytes", pct: 91 }], appUrl }),
    trialRequestEmail({
      name: "Ana Giménez",
      whatsapp: "595981000000",
      company: "Agropecuaria Giménez",
      crops: "soja, maíz",
      hectares: "850",
      employees: "12",
      department: "Alto Paraná",
      appUrl,
    }),
    deleteRequestEmail({
      orgName: "Estancia San Pedro",
      orgId: "00000000-0000-7000-8000-000000000003",
      requester: "Ana Giménez",
      requestId: "00000000-0000-7000-8000-000000000004",
      appUrl,
    }),
    planRequestEmail({
      orgName: "Estancia San Pedro",
      orgId: "00000000-0000-7000-8000-000000000003",
      plan: "active",
      maxHa: 2000,
      maxUsers: 15,
      billing: "Anual",
      note: "Sumamos dos campos en la zafra.",
      appUrl,
    }),
  ];
  return all.map((m) => {
    const subject = t("email.common.sample", { subject: m.subject });
    return { ...m, subject, html: m.html.replace(/<title>[^<]*<\/title>/, safeHtml`<title>${subject}</title>`.text) };
  });
}
