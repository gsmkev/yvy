/**
 * Qué bajar para usar una estancia sin conexión (ADR 0005): los PMTiles de la estancia (mapa base y último NDVI)
 * enteros, y del fondo de todo el país solo las teselas hasta un zoom razonable. Puro: sin red ni navegador.
 */
import { LIMITS } from "@yvy/shared/limits";
import { pickLayer } from "../scenes";
import type { FarmDetail, Layer } from "../types";

/** Mapa base de Paraguay en R2, publicado por el job country_basemap (el mismo que usa FarmMap). */
export const COUNTRY_BASEMAP = "base/paraguay.pmtiles";
/** [oeste, sur, este, norte] */
export type Bbox = [number, number, number, number];
export const PARAGUAY: Bbox = [-62.7, -27.7, -54.2, -19.2];

export type Tile = [z: number, x: number, y: number];

const MAX_LAT = 85.0511;
export const lonToX = (lon: number, z: number): number => Math.floor(((lon + 180) / 360) * 2 ** z);
export const latToY = (lat: number, z: number): number => {
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Teselas de un zoom que cubren el rectángulo. */
export function tilesIn(bbox: Bbox, z: number): Tile[] {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, lonToX(bbox[0], z));
  const x1 = Math.min(max, lonToX(bbox[2], z));
  const y0 = Math.max(0, latToY(bbox[3], z)); // el norte tiene la y más chica
  const y1 = Math.min(max, latToY(bbox[1], z));
  const out: Tile[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  return out;
}

const clip = (b: Bbox, to: Bbox): Bbox => [Math.max(b[0], to[0]), Math.max(b[1], to[1]), Math.min(b[2], to[2]), Math.min(b[3], to[3])];

/**
 * Teselas del fondo del país: hasta `countryFullZoom` el país entero; hasta `countryMaxZoom` solo alrededor de la
 * estancia. Si pasan del tope se descartan primero los zooms más altos.
 */
export interface TilePlanLimits {
  countryPadDeg: number;
  countryMaxZoom: number;
  countryFullZoom: number;
  countryMaxTiles: number;
}

export function countryTilePlan(farm: Bbox, limits: TilePlanLimits = LIMITS.webOffline): Tile[] {
  const pad = limits.countryPadDeg;
  const around = clip([farm[0] - pad, farm[1] - pad, farm[2] + pad, farm[3] + pad], PARAGUAY);
  const byZoom: Tile[][] = [];
  for (let z = 0; z <= limits.countryMaxZoom; z++) byZoom.push(tilesIn(z <= limits.countryFullZoom ? PARAGUAY : around, z));
  const out: Tile[] = [];
  for (const level of byZoom) {
    if (out.length + level.length > limits.countryMaxTiles) break;
    out.push(...level);
  }
  return out;
}

export interface FilePlan {
  url: string;
  bytes: number;
  layerId: string;
  kind: "true_color" | "ndvi";
}

export interface OfflinePlan {
  farmId: string;
  files: FilePlan[];
  countryUrl: string;
  tiles: Tile[];
  /** Bytes de los archivos de la estancia + estimado de las teselas del país. */
  estimateBytes: number;
}

const join = (base: string, path: string) => `${base.replace(/\/$/, "")}/${path}`;

export function planFarm(detail: Pick<FarmDetail, "farm" | "layers">, tilesBaseUrl: string): OfflinePlan {
  const files: FilePlan[] = [];
  const add = (l: Layer | undefined, kind: FilePlan["kind"]) => {
    if (l && !files.some((f) => f.url === join(tilesBaseUrl, l.pmtilesPath)))
      files.push({ url: join(tilesBaseUrl, l.pmtilesPath), bytes: l.bytes, layerId: l.id, kind });
  };
  add(pickLayer(detail.layers, "true_color"), "true_color");
  add(pickLayer(detail.layers, "ndvi"), "ndvi");
  const f = detail.farm;
  const tiles = countryTilePlan([f.minLon, f.minLat, f.maxLon, f.maxLat]);
  const fileBytes = files.reduce((a, x) => a + x.bytes, 0);
  return {
    farmId: f.id,
    files,
    countryUrl: join(tilesBaseUrl, COUNTRY_BASEMAP),
    tiles,
    estimateBytes: fileBytes + tiles.length * LIMITS.webOffline.countryTileBytesEstimate,
  };
}

export interface SavedFarm {
  savedAt: number;
  /** Archivos enteros guardados en la caché (los del país van aparte, como rangos sueltos). */
  files: { url: string; bytes: number; layerId: string }[];
  countryTiles: number;
}

export type SavedFarms = Record<string, SavedFarm>;

/** URL → bytes de todos los archivos guardados de todas las estancias (una estancia nueva puede compartir archivos). */
export function sizeMap(saved: SavedFarms): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of Object.values(saved)) for (const f of s.files) out[f.url] = f.bytes;
  return out;
}

export class OfflineQuotaError extends Error {
  constructor(
    readonly needBytes: number,
    readonly maxBytes: number,
  ) {
    super("No entra en el espacio reservado para mapas sin conexión");
  }
}

/** ¿Entran `plan.files` sin pasar el tope? Lo que ya está guardado no se vuelve a contar. */
export function checkRoom(plan: OfflinePlan, sizes: Record<string, number>, max = LIMITS.webOffline.mapMaxBytes): void {
  const fresh = plan.files.filter((f) => sizes[f.url] === undefined).reduce((a, f) => a + f.bytes, 0);
  const used = Object.values(sizes).reduce((a, b) => a + b, 0);
  if (used + fresh > max) throw new OfflineQuotaError(used + fresh, max);
}
