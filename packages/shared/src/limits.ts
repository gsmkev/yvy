/**
 * Único lugar con límites operativos (docs/PRD-cloudflare.md §6).
 * Pasar a plan pago = cambiar valores acá, nunca lógica.
 */
export const LIMITS = {
  sync: {
    /** Mutaciones por push. D1 permite 50 queries por invocación; dejamos margen. */
    maxMutationsPerPush: 40,
    /** Filas por página de pull. El PRD dice 500; 200 deja margen a los 10 ms de CPU. */
    pullPageSize: 200,
    /** Historial de registros y adjuntos que baja al celular (PRD §11). */
    recordsHistoryMs: 30 * 24 * 60 * 60 * 1000,
    /** Movimientos y mortandad de hacienda que bajan al celular (G-03): el stock se calcula allá, sin señal. */
    herdEventsHistoryMs: 365 * 24 * 60 * 60 * 1000,
    /** NDVI que baja al celular (PRD §11: último año). */
    indexStatsHistoryMs: 365 * 24 * 60 * 60 * 1000,
    /** Un registro con capturedAt más allá de esto en el futuro se rechaza (reloj mal puesto). */
    maxFutureCaptureMs: 60 * 60 * 1000,
    /** Tareas completadas que siguen bajando al celular. */
    tasksDoneHistoryMs: 30 * 24 * 60 * 60 * 1000,
    /** Largo máximo del nombre de un punto de interés. */
    maxPoiNameLength: 120,
    /** Ventana en que el empleado puede editar o borrar sus registros (RF-34, §9). */
    workerEditWindowMs: 24 * 60 * 60 * 1000,
    /** Sincronización automática en primer plano (PRD: 15 min; anexo Cloudflare: 30). */
    autoSyncIntervalMs: 30 * 60 * 1000,
    /** Si el servidor responde 1102 (CPU), el cliente divide el lote por esto. */
    backoffDivisor: 2,
    minMutationsPerPush: 5,
  },
  photos: {
    /** PRD RF-31 dice 5; el anexo Cloudflare baja a 3 por el límite de R2. */
    maxPerRecord: 3,
    maxLongSidePx: 1280,
    webpQuality: 0.6,
    thumbLongSidePx: 320,
    maxBytes: 600 * 1024,
    uploadUrlTtlSeconds: 15 * 60,
    downloadUrlTtlSeconds: 60 * 60,
  },
  audio: {
    /** Nota de voz (F-09): AAC en .m4a, un solo archivo por registro, sin miniatura. */
    mime: "audio/mp4",
    maxSeconds: 90,
    maxBytes: 1024 * 1024,
    maxPerRecord: 1,
  },
  auth: {
    emailCodeTtlMs: 10 * 60 * 1000,
    emailCodeMaxAttempts: 5,
    linkCodeTtlMs: 24 * 60 * 60 * 1000,
    accessTokenTtlSeconds: 60 * 60,
    /** Códigos de ingreso por IP en la ventana (anti abuso del tope de Resend). */
    emailCodesPerIp: 10,
    emailCodesIpWindowMs: 60 * 60 * 1000,
    refreshTokenTtlMs: 90 * 24 * 60 * 60 * 1000,
    /** Ingreso con teléfono y PIN de 6 dígitos (F-24): intentos por cuenta antes de bloquear, y cuánto dura el bloqueo. */
    pinMaxAttempts: 5,
    pinLockMs: 15 * 60 * 1000,
  },
  geometry: {
    /** Hectáreas: bajo esto un lote es casi seguro un error de dibujo. */
    minPlotHa: 0.1,
    maxFarmHa: 100_000,
    maxVertices: 5_000,
    /** M-20: vértices de una línea (alambrado, camino, cañería) y líneas por estancia. */
    maxLineVertices: 2_000,
    maxLinesPerFarm: 500,
  },
  ingest: {
    maxRowsPerRequest: 40,
    /** Tolerancia de reloj para la firma HMAC. */
    maxSkewMs: 5 * 60 * 1000,
  },
  storage: {
    d1ArchiveThresholdBytes: 400 * 1024 * 1024,
    archiveAfterMs: 365 * 24 * 60 * 60 * 1000,
    usageWarnRatio: 0.7,
  },
  weather: {
    forecastCacheMs: 3 * 60 * 60 * 1000,
    forecastRunsKept: 4,
    coordDecimals: 4,
    /** Horas de pronóstico que se guardan para las ventanas de pulverización (A-13). */
    hourlyHorizonHours: 48,
  },
  /** Condiciones para pulverizar (A-13): viento en km/h, Delta T en °C y sin lluvia. */
  spray: {
    windMinKmh: 3,
    windMaxKmh: 15,
    deltaTMin: 2,
    deltaTMax: 8,
    maxRainMm: 0,
  },
  /** F-14: formularios configurables por la organización. */
  forms: {
    maxFieldsPerKind: 10,
    maxLabel: 60,
    maxOptions: 12,
    maxOptionLength: 40,
    maxTextLength: 500,
  },
  monitoring: {
    /** Estaciones de muestreo que propone la app por lote (F-12). */
    defaultStations: 5,
    maxStations: 20,
    /** Conteo máximo por plaga en una estación. */
    maxCount: 10_000,
  },
  track: {
    /** Recorrida GPS (F-05): puntos que se guardan tras simplificar, y tolerancia de la simplificación en metros. */
    maxPoints: 500,
    simplifyToleranceM: 3,
    /** Se descartan fixes con peor precisión que esto y los que no se movieron al menos esto. */
    maxAccuracyM: 30,
    minStepM: 5,
    /** Muestreo: cada tanto tiempo o distancia (ahorra batería); el sistema agrupa lo que pueda. */
    sampleIntervalMs: 5000,
    sampleDistanceM: 5,
    /** Duración máxima de una recorrida registrada, en segundos (12 h). */
    maxDurationS: 12 * 3600,
  },
  vigor: {
    /** Caída de vigor (NDVI) entre las dos últimas pasadas que se avisa, en % (web y app). */
    dropThresholdPct: 15,
  },
  checklist: {
    /** Ítems por tarea (F-15). */
    maxItems: 30,
    maxTextLength: 120,
  },
  tasks: {
    /** Comentarios por tarea (se guardan como JSON en la propia tarea; ver tasks.comments). */
    maxComments: 50,
    maxCommentLength: 500,
    /** Lotes que se pueden elegir de una vez en el mapa al crear tareas (T-01). */
    maxPlotsPerBatch: 40,
  },
  /**
   * Topes por plan (P-10): hectáreas de estancias y personas con acceso (todos los roles). `null` = sin tope.
   * El equipo de Yvy puede fijar topes propios por organización desde el panel interno (organizations.max_ha / max_users).
   */
  plans: {
    trial: { maxHa: 100_000, maxUsers: 25 },
    active: { maxHa: 500_000, maxUsers: 100 },
    blocked: { maxHa: 100_000, maxUsers: 25 },
    demo: { maxHa: null, maxUsers: null },
  },
  events: {
    /** Fracción de los eventos de uso (no del embudo) que se guarda. */
    sampleRate: 0.5,
    perUserPerMinute: 30,
    nameLength: 40,
    /** Los eventos de uso se borran pasado este tiempo; los del embudo quedan. */
    retentionMs: 90 * 24 * 60 * 60 * 1000,
  },
  /** ERP sencillo (ADR 0004). */
  erp: {
    /** Días de aviso antes del vencimiento de un lote de agroquímico o vacuna (E-12). */
    expiryWarnDays: 30,
    /** Filas que devuelven los listados de movimientos y costos (el plan gratis no admite más por request). */
    listLimit: 300,
    /** Lotes de una orden de trabajo creados de una vez (cada lote es una tarea). */
    maxPlotsPerOrder: 40,
    /**
     * Salidas de stock que un solo push puede generar (consumo automático de los registros de campo). Con 12 columnas
     * por fila son ~9 sentencias; más que eso se responde 503 y el celular divide el envío.
     */
    maxEffectMovesPerPush: 60,
  },
  share: {
    /** Duraciones permitidas del enlace de solo lectura (K-04), en días. */
    linkDays: [7, 30],
  },
} as const;

export type Limits = typeof LIMITS;

export type PlanName = keyof typeof LIMITS.plans;

/** Topes efectivos de una organización: los propios si los tiene, y si no los de su plan. */
export const planLimits = (
  plan: string,
  own: { maxHa?: number | null; maxUsers?: number | null } = {},
): { maxHa: number | null; maxUsers: number | null } => {
  const base: { maxHa: number | null; maxUsers: number | null } =
    LIMITS.plans[plan as PlanName] ?? LIMITS.plans.trial;
  return { maxHa: own.maxHa ?? base.maxHa, maxUsers: own.maxUsers ?? base.maxUsers };
};
