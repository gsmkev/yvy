/** Fotos (anexo §4.4): lado largo 1280 px, WebP 0,6 (~120 KB) + miniatura de 320 px, en el celular. */
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { LIMITS, newId } from "@yvy/shared";
import type { LocalPhoto } from "../db/store";

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
