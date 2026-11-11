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
  auth: {
    emailCodeTtlMs: 10 * 60 * 1000,
    emailCodeMaxAttempts: 5,
    linkCodeTtlMs: 24 * 60 * 60 * 1000,
    accessTokenTtlSeconds: 60 * 60,
    /** Códigos de ingreso por IP en la ventana (anti abuso del tope de Resend). */
    emailCodesPerIp: 10,
    emailCodesIpWindowMs: 60 * 60 * 1000,
    refreshTokenTtlMs: 90 * 24 * 60 * 60 * 1000,
  },
  geometry: {
    /** Hectáreas: bajo esto un lote es casi seguro un error de dibujo. */
    minPlotHa: 0.1,
    maxFarmHa: 100_000,
    maxVertices: 5_000,
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
  },
  monitoring: {
    /** Estaciones de muestreo que propone la app por lote (F-12). */
    defaultStations: 5,
    maxStations: 20,
    /** Conteo máximo por plaga en una estación. */
    maxCount: 10_000,
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
  share: {
    /** Duraciones permitidas del enlace de solo lectura (K-04), en días. */
    linkDays: [7, 30],
  },
} as const;

export type Limits = typeof LIMITS;
