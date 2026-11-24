/**
 * Acceso de sistema (sin usuario): /ingest firmado por HMAC y crons. Única excepción a scopedDb.
 * Cada escritura deriva organization_id de la fila padre (lote o estancia), nunca del request.
 */
import type { DB } from "../client";
import * as farms from "./farms";
import * as satellite from "./satellite";
import * as climate from "./climate";
import * as reports from "./reports";
import * as benchmark from "./benchmark";
import * as alertsLeads from "./alerts-leads";
/** Argumentos de un método sin el primero (la fachada pasa `this`). */
type Rest<F> = F extends (first: SystemDb, ...a: infer R) => unknown ? R : never;

export class SystemDb {
  constructor(readonly db: DB) {}

  // ---------- Estancias (farms.ts) ----------

  activeFarms(...a: Rest<typeof farms.activeFarms>) {
    return farms.activeFarms(this, ...a);
  }

  /**
   * Resumen público de una estancia para un enlace de solo lectura (K-04). Devuelve el motivo si el enlace no sirve.
   * No incluye registros, personas ni geometrías: solo lotes, superficie, vigor, lluvia y avisos.
   */
  sharedSummary(...a: Rest<typeof farms.sharedSummary>) {
    return farms.sharedSummary(this, ...a);
  }

  /** Umbrales de avisos de la estancia (C-04); por defecto si no hay fila. */
  alertSettings(...a: Rest<typeof farms.alertSettings>) {
    return farms.alertSettings(this, ...a);
  }

  farmGeometry(...a: Rest<typeof farms.farmGeometry>) {
    return farms.farmGeometry(this, ...a);
  }

  /** A-31: análisis de suelo de la estancia con coordenadas (para interpolar mapas de fertilidad). */
  soilPoints(...a: Rest<typeof farms.soilPoints>) {
    return farms.soilPoints(this, ...a);
  }

  /** S-20: focos de calor guardados cerca de la estancia (bbox + ~2 km) desde `since`. */
  farmHotspots(...a: Rest<typeof farms.farmHotspots>) {
    return farms.farmHotspots(this, ...a);
  }

  /** C-07: lluvia diaria de la estancia desde una fecha (CHIRPS final, o preliminar si la final todavía no salió). */
  farmPrecip(...a: Rest<typeof farms.farmPrecip>) {
    return farms.farmPrecip(this, ...a);
  }

  // ---------- Satélite (satellite.ts) ----------

  /** Registra la escena. `processed` indica si ya se cargaron sus estadísticas. */
  upsertScene(...a: Rest<typeof satellite.upsertScene>) {
    return satellite.upsertScene(this, ...a);
  }

  markSceneProcessed(...a: Rest<typeof satellite.markSceneProcessed>) {
    return satellite.markSceneProcessed(this, ...a);
  }

  upsertIndexStats(...a: Rest<typeof satellite.upsertIndexStats>) {
    return satellite.upsertIndexStats(this, ...a);
  }

  addFarmLayer(...a: Rest<typeof satellite.addFarmLayer>) {
    return satellite.addFarmLayer(this, ...a);
  }

  /**
   * Retención en R2: marca borradas las versiones de una capa que pasan el tope de LIMITS.storage.layerRetention
   * (las más viejas) y devuelve sus rutas para borrar los archivos. El borrado lógico viaja por sync al celular.
   */
  pruneFarmLayers(...a: Rest<typeof satellite.pruneFarmLayers>) {
    return satellite.pruneFarmLayers(this, ...a);
  }

  /** M-17: GeoTIFF de una estancia esperando su conversión a PNG georreferenciado. */
  pendingCustomLayers(...a: Rest<typeof satellite.pendingCustomLayers>) {
    return satellite.pendingCustomLayers(this, ...a);
  }

  /** M-17: resultado de la conversión. Devuelve false si la capa no existe, ya no está pendiente o la ruta no es suya. */
  finishCustomLayer(...a: Rest<typeof satellite.finishCustomLayer>) {
    return satellite.finishCustomLayer(this, ...a);
  }

  /** Estado del procesamiento satelital inicial. Devuelve false si la estancia no existe. */
  setImageryStatus(...a: Rest<typeof satellite.setImageryStatus>) {
    return satellite.setImageryStatus(this, ...a);
  }

  /** S-03: el job de historia avisa que terminó (done) o falló. */
  setHistoryStatus(...a: Rest<typeof satellite.setHistoryStatus>) {
    return satellite.setHistoryStatus(this, ...a);
  }

  /**
   * S-08: reemplaza las áreas problema de un lote por las de la escena `acquiredAt` (lista vacía = las limpia).
   * Si ya hay áreas de una escena más nueva, no pisa nada. La organización sale del lote, no del request.
   */
  replaceProblemAreas(...a: Rest<typeof satellite.replaceProblemAreas>) {
    return satellite.replaceProblemAreas(this, ...a);
  }

  /** C-10: guarda (reemplaza) el informe de riesgo de la estancia. */
  /** A-32: reemplaza las zonas de manejo de un lote. La organización y la estancia salen del lote, no del request. */
  replaceManagementZones(...a: Rest<typeof satellite.replaceManagementZones>) {
    return satellite.replaceManagementZones(this, ...a);
  }

  /** S-30: guarda (reemplaza) el indicador EUDR de un lote. La organización sale del lote, no del request. */
  upsertEudrResult(...a: Rest<typeof satellite.upsertEudrResult>) {
    return satellite.upsertEudrResult(this, ...a);
  }

  /** S-20 y S-31: guarda (reemplaza) el análisis de un lote. La organización sale del lote, no del request. */
  upsertAnalysis(...a: Rest<typeof satellite.upsertAnalysis>) {
    return satellite.upsertAnalysis(this, ...a);
  }

  /** S-31: el job termina (o falla); solo cambia el estado de un pedido existente. */
  setAnalysisStatus(...a: Rest<typeof satellite.setAnalysisStatus>) {
    return satellite.setAnalysisStatus(this, ...a);
  }

  // ---------- Clima (climate.ts) ----------

  upsertClimateDaily(...a: Rest<typeof climate.upsertClimateDaily>) {
    return climate.upsertClimateDaily(this, ...a);
  }

  climateLatest(...a: Rest<typeof climate.climateLatest>) {
    return climate.climateLatest(this, ...a);
  }

  upsertClimatology(...a: Rest<typeof climate.upsertClimatology>) {
    return climate.upsertClimatology(this, ...a);
  }

  /** C-07: guarda (reemplaza) el SPI de la estancia. */
  upsertFarmSpi(...a: Rest<typeof climate.upsertFarmSpi>) {
    return climate.upsertFarmSpi(this, ...a);
  }

  upsertFarmRisk(...a: Rest<typeof climate.upsertFarmRisk>) {
    return climate.upsertFarmRisk(this, ...a);
  }

  // ---------- Parte semanal (reports.ts) ----------

  /**
   * R-02: datos del parte semanal de una estancia para el PDF que arma workers-py. Son pocas consultas
   * agregadas; el armado del PDF (lo pesado) no pasa por el Worker. `from` y `to` son fechas locales (UTC-3).
   */
  weeklySummary(...a: Rest<typeof reports.weeklySummary>) {
    return reports.weeklySummary(this, ...a);
  }

  /** R-02: registra el PDF semanal ya subido a R2 (reemplaza el del mismo período). */
  saveWeeklyReport(...a: Rest<typeof reports.saveWeeklyReport>) {
    return reports.saveWeeklyReport(this, ...a);
  }

  /** R-02: PDF semanal generado en los últimos `maxAgeMs` (para adjuntarlo al email del lunes). */
  latestWeeklyReport(...a: Rest<typeof reports.latestWeeklyReport>) {
    return reports.latestWeeklyReport(this, ...a);
  }

  // ---------- Comparación con la zona (benchmark.ts) ----------

  /** R-08: estancias de OTRAS organizaciones dentro de la caja, con su centro. Solo para calcular medianas. */
  benchmarkCandidates(...a: Rest<typeof benchmark.benchmarkCandidates>) {
    return benchmark.benchmarkCandidates(this, ...a);
  }

  /**
   * R-08: vigor medio (NDVI de los lotes desde `since`) y lluvia acumulada (CHIRPS desde `sinceDate`) por estancia.
   * 2 consultas por tanda de ≤ 90 estancias.
   */
  benchmarkMetrics(...a: Rest<typeof benchmark.benchmarkMetrics>) {
    return benchmark.benchmarkMetrics(this, ...a);
  }

  saveBenchmark(...a: Rest<typeof benchmark.saveBenchmark>) {
    return benchmark.saveBenchmark(this, ...a);
  }

  clearBenchmark(...a: Rest<typeof benchmark.clearBenchmark>) {
    return benchmark.clearBenchmark(this, ...a);
  }

  // ---------- Avisos, leads y limpieza (alerts-leads.ts) ----------

  fireAlert(...a: Rest<typeof alertsLeads.fireAlert>) {
    return alertsLeads.fireAlert(this, ...a);
  }

  /** Mantenimiento diario: borra códigos y tokens vencidos. */
  /** V-04: pedidos del informe gratis que esperan al job (sin enviar, con intentos disponibles, de los últimos 30 días). */
  pendingLeads(...a: Rest<typeof alertsLeads.pendingLeads>) {
    return alertsLeads.pendingLeads(this, ...a);
  }

  /** V-04: guarda el informe del pedido y cuenta el intento. Devuelve el email, o null si no existe o ya se envió. */
  saveLeadReport(...a: Rest<typeof alertsLeads.saveLeadReport>) {
    return alertsLeads.saveLeadReport(this, ...a);
  }

  markLeadSent(...a: Rest<typeof alertsLeads.markLeadSent>) {
    return alertsLeads.markLeadSent(this, ...a);
  }

  purgeExpiredAuth(...a: Rest<typeof alertsLeads.purgeExpiredAuth>) {
    return alertsLeads.purgeExpiredAuth(this, ...a);
  }
}
