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
    /** X-09: aviso de calidad sobre una miniatura. Umbrales orientativos (luminancia 0-255; varianza del laplaciano). */
    quality: { sidePx: 128, darkMeanLuma: 45, blurLaplacianVar: 25 },
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
    /** P-08: segundo factor. Intentos por usuario antes de bloquear, bloqueo, vida del pase tras el código de email y recuperación. */
    totpMaxAttempts: 5,
    totpLockMs: 15 * 60 * 1000,
    totpTicketTtlMs: 5 * 60 * 1000,
    totpRecoveryCodes: 8,
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
    /** C-03: pronóstico por lote solo en estancias de más de esta superficie (ha); como mucho esta cantidad de lotes. */
    plotForecastMinFarmHa: 2_000,
    plotForecastMaxPlots: 60,
    plotForecastDays: 10,
  },
  /** Condiciones para pulverizar (A-13): viento en km/h, Delta T en °C y sin lluvia. */
  spray: {
    windMinKmh: 3,
    windMaxKmh: 15,
    deltaTMin: 2,
    deltaTMax: 8,
    maxRainMm: 0,
  },
  /** Informe gratis a cambio del email (V-04). */
  leads: {
    /** Pedidos por conexión (IP) en 24 h. */
    perIpPerDay: 3,
    /** Un mismo email puede volver a pedir pasado este tiempo. */
    emailCooldownMs: 7 * 24 * 60 * 60 * 1000,
    /** Pedidos que el job procesa por corrida y veces que se reintenta uno que falla. */
    jobBatch: 20,
    maxAttempts: 5,
    /** El email y el informe se borran pasado este tiempo. */
    retentionMs: 90 * 24 * 60 * 60 * 1000,
    /** Versión del texto de consentimiento que aceptó la persona (se guarda con el pedido). */
    consentVersion: "2026-11",
    /** Rectángulo de Paraguay: el informe usa focos de calor de NASA FIRMS solo de ese país. */
    bbox: { minLon: -62.7, maxLon: -54.2, minLat: -27.7, maxLat: -19.2 },
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
  oddities: {
    /** X-26: se revisan los registros de los últimos días. */
    windowDays: 90,
    maxCandidates: 500,
    /** Lluvia diaria por encima de esto (mm) se marca. Valor general: en el Chaco o el este puede haber más, y se confirma con "Está bien". */
    rainMmPerDay: 150,
    /** Meses [desde, hasta] en que se espera cada plaga en soja y maíz del país (se admite cruzar el año). Fuera de eso se marca. */
    pestMonths: { chinche: [10, 5], oruga: [10, 5], roya: [11, 5] },
    /** Rinde máximo creíble en t/ha por cultivo (el cultivo sale del lote). */
    maxYieldTHa: { soja: 7, maiz: 18, trigo: 9, arroz: 14, girasol: 5, chia: 3, otro: 40 },
  },
  emergency: {
    /** F-30: contactos de emergencia que se guardan en el celular. */
    maxContacts: 5,
  },
  status: {
    /** Horas sin una corrida buena a partir de las cuales un job de datos figura "atrasado" (P-04). */
    staleAfterHours: { sentinel2: 7 * 24, chirps: 3 * 24, firms: 2 * 24 },
    /** /ingest anota la corrida de un job a lo sumo una vez por este tiempo. */
    recordEveryMs: 60_000,
    probeTimeoutMs: 3_000,
  },
  webhooks: {
    maxPerOrg: 5,
    /** Pausa del envío tras tantos fallos seguidos (el dueño la reactiva desde Cuenta). */
    disableAfterFailures: 20,
    timeoutMs: 8_000,
    /** Espera antes de cada reintento de la cola, en segundos (la cola reintenta 3 veces). */
    retryDelaysSec: [30, 300, 1800],
    /** Un evento del buzón que nadie pasó a la cola se descarta pasado este tiempo. */
    outboxRetentionMs: 3 * 24 * 60 * 60 * 1000,
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
    /** Asientos que entran en una exportación al contador (E-38); si hay más, se avisa que se recortó el período. */
    exportLimit: 2000,
  },
  /** T-08: comentarios en registros. */
  comments: {
    maxLength: 1000,
    maxMentions: 10,
    /** Comentarios por registro (tope para que el celular no cargue hilos eternos). */
    maxPerRecord: 200,
  },
  /** R-10: destinatarios externos de informes programados por organización. */
  reportSchedules: { max: 10 },
  /** I-01: API pública. */
  api: {
    /** Pedidos por token por minuto. */
    perMinute: 60,
    maxTokensPerOrg: 5,
    maxPageSize: 200,
    defaultPageSize: 50,
  },
  /** K-06: registro de cambios de la organización. */
  audit: {
    pageSize: 50,
    /** Campos con valor corto que se guardan tal cual en el detalle de un cambio; el resto solo se nombra. */
    maxValueLength: 80,
  },
  share: {
    /** Duraciones permitidas del enlace de solo lectura (K-04), en días. */
    linkDays: [7, 30],
  },
  // agri-p2
  /** Mapas de rendimiento (A-21): celdas de la grilla resumen y tamaño máximo del cuerpo que acepta el Worker. */
  /**
   * Comparación anónima con la zona (R-08): estancias de OTRAS organizaciones dentro de `radiusKm`. Solo se publica si hay
   * al menos `minFarms` estancias de al menos `minOrgs` organizaciones distintas; vigor y lluvia de los últimos `windowDays`.
   */
  benchmark: { radiusKm: 30, minFarms: 3, minOrgs: 3, windowDays: 30, maxNeighbors: 300 },
  yieldMap: { maxCells: 800, maxBodyBytes: 120_000 },
  /**
   * Capas propias (M-17): imagen georreferenciada por estancia. PNG/JPG con 4 esquinas se guardan tal cual;
   * un GeoTIFF (dron, mapa de suelos) lo convierte workers-py. El Worker solo valida tamaño y tipo.
   */
  customLayers: { maxPerFarm: 20, imageMaxBytes: 10_000_000, geotiffMaxBytes: 90_000_000, nameMaxLength: 80 },
  /**
   * Roya asiática de la soja (A-40): mojado foliar estimado con el pronóstico horario. Una hora cuenta si la humedad
   * relativa llega a `humidityPct` (o llueve `rainMm`) y la temperatura está entre `tempMinC` y `tempMaxC`.
   * Valores de referencia a revisar por un agrónomo.
   */
  rust: { humidityPct: 90, rainMm: 0.1, tempMinC: 15, tempMaxC: 28, watchHours: 8, warningHours: 12 },
  /**
   * Zonas de amortiguación (A-15): distancia en metros a casas, escuelas y cursos de agua dentro de la cual una
   * aplicación se marca. Valores de referencia que la web deja editar: confirmá lo que exige la normativa vigente
   * y la habilitación de tu zona antes de usarlos como límite legal.
   */
  buffer: { house: 100, school: 100, water: 100, stream: 100, maxM: 2_000 },
  /** Ventana de siembra (A-05): valores de referencia, a revisar por un agrónomo. */
  sowing: {
    /** Humedad del suelo superficial (NASA POWER GWETTOP, fracción de saturación 0-1): abajo no germina, arriba encharca. */
    soilMinFraction: 0.35,
    soilMaxFraction: 0.9,
    /** Lluvia en un día a partir de la cual no se entra al lote. */
    heavyRainDayMm: 15,
    /** Lluvia acumulada en 3 días que compensa un suelo justo. */
    rainAheadMm: 12,
    /** Temperatura mínima del aire (°C) por debajo de la cual se espera. */
    minTminC: { soja: 10, maiz: 10, trigo: 0, arroz: 15, girasol: 8, chia: 10, otro: 10 } as Record<string, number>,
    /** Días de pronóstico que se evalúan. */
    horizonDays: 7,
  },
  /** Mapas de fertilidad (A-31): puntos con coordenadas y valor que pide cada parámetro para interpolar. Igual en workers-py. */
  fertility: { minPoints: 8 },
  /** Prescripción de dosis variable (A-33): dosis máxima por hectárea (kg o l). */
  prescription: { maxRate: 100_000 },
  /** Feedlot (G-33): ingredientes por ración, tolerancia de la suma de % de MS y tope de MS por suministro (kg). */
  feedlot: { maxRationItems: 12, pctTolerance: 0.5, maxKgDm: 1_000_000 },
  /** Planilla para el contador (E-27): meses como máximo por exportación. */
  payroll: { maxMonths: 24 },
  /** Exportación para sistemas contables (I-06): columnas por formato y diferencia tolerada entre el desglose de IVA y el importe (Gs.). */
  exportFormat: { maxColumns: 20, taxToleranceGs: 5 },
  /** Riego (A-43): lámina máxima por registro, en mm. */
  irrigation: { maxMm: 500 },
  /** Balance hídrico por lote (C-08): lluvia menos consumo del cultivo, en mm. */
  waterBalance: {
    /** Ventana reciente para el riesgo de estrés. */
    recentDays: 14,
    /** Balance de la ventana reciente (mm) a partir del cual el riesgo es medio o alto. */
    mediumRiskMm: -30,
    highRiskMm: -60,
    /** Días de historia que devuelve la serie. */
    maxDays: 200,
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
