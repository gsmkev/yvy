/**
 * Esquema Drizzle compartido (adaptado a SQLite).
 * Mismo esquema en D1 (Worker) y expo-sqlite (app).
 *
 * Convenciones:
 * - ids UUIDv7 generados en el cliente (text).
 * - Fechas epoch ms (integer); fechas de calendario como text "YYYY-MM-DD".
 * - JSON en text; arrays como tabla puente (ej. alert_plots).
 * - Geometrías GeoJSON en text + columnas bbox indexadas.
 * - Tablas sincronizables: organization_id, created_at, updated_at (servidor), deleted_at y
 *   `version`, contador monotónico asignado por el servidor dentro de la transacción (sync_seq).
 *   El pull pagina por (version, id): equivale a "updated_at + desempate por id"
 *   pero sin depender de relojes de distintos datacenters.
 */
export * from "./enums";
export * from "./identity";
export * from "./field";
export * from "./campaigns";
export * from "./erp-master";
export * from "./work";
export * from "./sync";
export * from "./satellite";
export * from "./climate-analysis";
export * from "./alerts";
export * from "./reports";
export * from "./operations";
export * from "./erp-staff";
export * from "./erp-trade";
