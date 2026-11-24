/** Vista web: reduce la imagen con un canvas y la sube con fetch. */
import { LIMITS, t } from "@yvy/shared";
import { api } from "../lib/session";
import type { PickedPhoto } from "./invoicePhoto";

export type PhotoKind = "purchases" | "cattle-deals" | "stock-moves" | "cost-entries";

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", q));

async function compress(uri: string): Promise<Blob> {
  const bmp = await createImageBitmap(await (await fetch(uri)).blob());
  const scale = Math.min(1, LIMITS.photos.maxLongSidePx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let blob: Blob | null = null;
  for (const q of [LIMITS.photos.webpQuality, 0.5, 0.4, 0.3]) {
    blob = await toBlob(canvas, q);
    if (blob && blob.size <= LIMITS.photos.maxBytes) return blob;
  }
  if (!blob) throw new Error(t("ui.photo.uploadFailed"));
  return blob;
}

export async function uploadInvoicePhoto(kind: PhotoKind, id: string, p: PickedPhoto): Promise<void> {
  const blob = await compress(p.uri);
  const { url } = await api<{ url: string }>("POST", `/org/erp/photos/${kind}/${id}/upload-url`);
  const put = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": "image/webp" } });
  if (!put.ok) throw new Error(t("ui.photo.uploadFailed"));
  await api("POST", `/org/erp/photos/${kind}/${id}/uploaded`);
}
