/** Reduce una foto a WebP con los mismos topes que las fotos de la app (LIMITS.photos). */
import { LIMITS } from "@yvy/shared";

const toBlob = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/webp", quality));

export async function compressPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, LIMITS.photos.maxLongSidePx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let blob: Blob | null = null;
  // Si todavía pasa el tope, se baja la calidad de a poco.
  for (const q of [LIMITS.photos.webpQuality, 0.5, 0.4, 0.3]) {
    blob = await toBlob(canvas, q);
    if (blob && blob.size <= LIMITS.photos.maxBytes) return blob;
  }
  if (!blob) throw new Error("No se pudo procesar la foto");
  return blob;
}
