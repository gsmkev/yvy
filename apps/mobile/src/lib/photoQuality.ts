/**
 * X-09: calidad de la foto antes de guardarla. Heurística local, sin modelo: sobre una miniatura chica se mide la
 * oscuridad (luminancia media) y el desenfoque (varianza del laplaciano). Solo avisa; nunca bloquea.
 * jpeg-js es JS puro (sin módulos nativos): decodifica la miniatura que ya genera expo-image-manipulator.
 * Los umbrales viven en LIMITS.photos.quality y son orientativos: conviene ajustarlos con fotos reales del campo.
 */
import { decode } from "jpeg-js";
import { LIMITS, t } from "@yvy/shared";

export interface PhotoStats {
  /** Luminancia media, 0 (negro) a 255 (blanco). */
  meanLuma: number;
  /** Varianza del laplaciano de la luminancia: baja = poco borde = movida o desenfocada. */
  blurVariance: number;
}

export type PhotoIssue = "dark" | "blurry";

/** RGBA → luminancia (Rec. 601). */
export function toLuma(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  return out;
}

export function analyzeLuma(luma: ArrayLike<number>, width: number, height: number): PhotoStats {
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += luma[i]!;
  const meanLuma = n ? sum / n : 0;
  // Laplaciano de 4 vecinos sobre el interior de la imagen
  let lSum = 0;
  let lSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = luma[i - 1]! + luma[i + 1]! + luma[i - width]! + luma[i + width]! - 4 * luma[i]!;
      lSum += l;
      lSq += l * l;
      count++;
    }
  }
  const blurVariance = count ? lSq / count - (lSum / count) ** 2 : 0;
  return { meanLuma, blurVariance };
}

export function photoIssues(stats: PhotoStats): PhotoIssue[] {
  const q = LIMITS.photos.quality;
  const out: PhotoIssue[] = [];
  if (stats.meanLuma < q.darkMeanLuma) out.push("dark");
  if (stats.blurVariance < q.blurLaplacianVar) out.push("blurry");
  return out;
}

/** Aviso en es-PY para los problemas encontrados; null si la foto está bien. */
export function photoIssueMessage(issues: PhotoIssue[]): string | null {
  if (!issues.length) return null;
  return t(issues.length === 2 ? "app.photoQualityBoth" : issues[0] === "dark" ? "app.photoQualityDark" : "app.photoQualityBlurry");
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 → bytes sin depender de atob ni Buffer (Hermes no siempre los tiene). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]!);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, o);
}

/** Estadísticas de una miniatura JPEG (bytes). Devuelve null si no se pudo decodificar. */
export function analyzeJpeg(bytes: Uint8Array): PhotoStats | null {
  try {
    const img = decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 1 });
    return analyzeLuma(toLuma(img.data, img.width, img.height), img.width, img.height);
  } catch {
    return null;
  }
}
