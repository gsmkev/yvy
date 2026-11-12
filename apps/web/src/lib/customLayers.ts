/** M-17: capas propias (imagen georreferenciada) de una estancia. */
import { useQueries, useQuery } from "@tanstack/react-query";
import { LIMITS } from "@yvy/shared";
import { get, getBlob } from "./api";
import { parseLocation } from "./coords";

export interface CustomLayer {
  id: string;
  name: string;
  kind: "image" | "geotiff";
  status: "processing" | "ready" | "failed";
  bytes: number;
  /** [lon, lat] arriba-izq., arriba-der., abajo-der., abajo-izq. */
  corners: [number, number][] | null;
  createdAt: number;
}

export const useCustomLayers = (farmId: string, enabled = true) =>
  useQuery({
    queryKey: ["custom-layers", farmId],
    queryFn: () => get<CustomLayer[]>(`/org/farms/${farmId}/custom-layers`),
    enabled,
    // mientras un GeoTIFF se procesa, se vuelve a preguntar
    refetchInterval: (q) => (q.state.data?.some((l) => l.status === "processing") ? 15_000 : false),
  });

/** Imágenes de las capas activas como URL local (la API pide sesión, MapLibre no la manda). */
export function useCustomLayerImages(ids: string[]) {
  const res = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["custom-layer-image", id],
      queryFn: async () => URL.createObjectURL(await getBlob(`/org/custom-layers/${id}/image`)),
      staleTime: Infinity,
      gcTime: 10 * 60_000,
    })),
  });
  return Object.fromEntries(ids.map((id, i) => [id, res[i]!.data ?? null])) as Record<string, string | null>;
}

export type CustomKind = "image" | "geotiff" | null;

/** PNG/JPG o GeoTIFF por el tipo del archivo (o la extensión, que el sistema a veces no informa). */
export function customFileMime(f: { name: string; type: string }): string | null {
  if (f.type === "image/png" || f.type === "image/jpeg" || f.type === "image/tiff") return f.type;
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  return null;
}

export const customMaxBytes = (mime: string) =>
  mime === "image/tiff" ? LIMITS.customLayers.geotiffMaxBytes : LIMITS.customLayers.imageMaxBytes;

/** Cuatro textos "lat, lon" a esquinas [lon, lat]; null si alguno no se entiende. */
export function parseCornerInputs(inputs: string[]): [number, number][] | null {
  if (inputs.length !== 4) return null;
  const out: [number, number][] = [];
  for (const i of inputs) {
    const p = parseLocation(i);
    if (!p) return null;
    out.push([p.lon, p.lat]);
  }
  const lons = out.map((p) => p[0]);
  const lats = out.map((p) => p[1]);
  if (Math.max(...lons) - Math.min(...lons) < 1e-6 || Math.max(...lats) - Math.min(...lats) < 1e-6) return null;
  return out;
}
