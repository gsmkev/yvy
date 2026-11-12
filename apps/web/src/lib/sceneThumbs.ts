/**
 * Miniaturas del selector de fecha (S-04): por cada fecha se pide UNA sola tesela del PMTiles de esa capa
 * (la que cubre el centro de la estancia, al zoom en que la tesela entra completa en la estancia o el más
 * cercano que tenga el archivo) y se guarda en memoria. Una fecha, una tesela, una sola vez.
 */
import { PMTiles, TileType } from "pmtiles";
import type { Layer } from "./types";

export type Bounds = [number, number, number, number];

/** Posición de la tesela XYZ que contiene el punto, al zoom z. */
export function tileOf(lon: number, lat: number, z: number): { z: number; x: number; y: number } {
  const n = 2 ** z;
  const x = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const rad = (lat * Math.PI) / 180;
  const y = Math.min(
    n - 1,
    Math.max(0, Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)),
  );
  return { z, x, y };
}

/**
 * Tesela de la miniatura: la del centro de la estancia, al mayor zoom donde la tesela sigue siendo
 * al menos tan ancha como la estancia (así se ve todo el campo), limitado a los zooms del archivo.
 */
export function thumbTile(bounds: Bounds, minZoom: number, maxZoom: number): { z: number; x: number; y: number } {
  const width = Math.max(bounds[2] - bounds[0], 1e-6);
  const fit = Math.floor(Math.log2(360 / width));
  const z = Math.min(maxZoom, Math.max(minZoom, fit));
  return tileOf((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, z);
}

const MIME: Partial<Record<number, string>> = {
  [TileType.Png]: "image/png",
  [TileType.Jpeg]: "image/jpeg",
  [TileType.Webp]: "image/webp",
  [TileType.Avif]: "image/avif",
};

const cache = new Map<string, Promise<string | null>>();

/** Cuántas miniaturas están en memoria (para pruebas). */
export const thumbCacheSize = () => cache.size;
export const clearThumbCache = () => cache.clear();

/**
 * URL (blob:) de la miniatura de una capa, o null si el archivo no tiene imagen ráster o la tesela no existe.
 * El resultado se recuerda por archivo: abrir y cerrar el selector no vuelve a pedir nada.
 */
export function layerThumb(tilesBaseUrl: string, layer: Pick<Layer, "pmtilesPath" | "bounds">, bounds: Bounds): Promise<string | null> {
  const url = `${tilesBaseUrl.replace(/\/$/, "")}/${layer.pmtilesPath}`;
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      try {
        const pm = new PMTiles(url);
        const h = await pm.getHeader();
        const mime = MIME[h.tileType];
        if (!mime) return null;
        const { z, x, y } = thumbTile(bounds, h.minZoom, h.maxZoom);
        const tile = await pm.getZxy(z, x, y);
        return tile ? URL.createObjectURL(new Blob([tile.data], { type: mime })) : null;
      } catch {
        cache.delete(url); // falla de red: la próxima vez se reintenta
        return null;
      }
    })();
    cache.set(url, p);
  }
  return p;
}
