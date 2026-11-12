/** Fotos (anexo §4.4): lado largo 1280 px, WebP 0,6 (~120 KB) + miniatura de 320 px, en el celular. */
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { LIMITS, newId } from "@yvy/shared";
import type { LocalPhoto } from "../db/store";
import { analyzeJpeg, base64ToBytes, photoIssueMessage, photoIssues } from "./photoQuality";

const DIR = `${FileSystem.documentDirectory}photos/`;

async function resize(uri: string, w: number, h: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(w, h));
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  const img = await ctx.renderAsync();
  return img.saveAsync({ format: SaveFormat.WEBP, compress: LIMITS.photos.webpQuality });
}

export async function processPhoto(uri: string, width: number, height: number): Promise<LocalPhoto> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const id = newId();
  const big = await resize(uri, width, height, LIMITS.photos.maxLongSidePx);
  const thumb = await resize(uri, width, height, LIMITS.photos.thumbLongSidePx);
  const photoUri = `${DIR}${id}.webp`;
  const thumbUri = `${DIR}${id}_t.webp`;
  await FileSystem.moveAsync({ from: big.uri, to: photoUri });
  await FileSystem.moveAsync({ from: thumb.uri, to: thumbUri });
  const info = await FileSystem.getInfoAsync(photoUri);
  return { photoUri, thumbUri, width: big.width, height: big.height, bytes: info.exists ? info.size : 0 };
}

/** F-17: borra del celular los archivos de una foto que se descartó antes de guardar el registro. */
export async function discardPhoto(p: LocalPhoto): Promise<void> {
  await Promise.all([FileSystem.deleteAsync(p.photoUri, { idempotent: true }), FileSystem.deleteAsync(p.thumbUri, { idempotent: true })]).catch(() => {});
}

/**
 * X-09: revisa la foto recién sacada sobre una miniatura. Devuelve el aviso en es-PY si salió oscura o movida, o null si
 * está bien (o si no se pudo revisar: ante la duda no se molesta). Nunca lanza ni bloquea.
 */
export async function photoQualityWarning(uri: string, width: number, height: number): Promise<string | null> {
  try {
    const side = LIMITS.photos.quality.sidePx;
    const scale = Math.min(1, side / Math.max(width, height));
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) });
    const img = await ctx.renderAsync();
    const small = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
    if (!small.base64) return null;
    const stats = analyzeJpeg(base64ToBytes(small.base64));
    return stats ? photoIssueMessage(photoIssues(stats)) : null;
  } catch {
    return null;
  }
}
