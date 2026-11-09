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
    refreshTokenTtlMs: 90 * 24 * 60 * 60 * 1000,
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
} as const;

export type Limits = typeof LIMITS;
