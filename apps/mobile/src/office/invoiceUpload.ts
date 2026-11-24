/** Sube la foto de una factura o un ticket a R2 con la URL firmada de la API (el archivo no pasa por el Worker). */
import * as FileSystem from "expo-file-system/legacy";
import { t } from "@yvy/shared";
import { discardPhoto, processPhoto } from "../lib/photos";
import { api } from "../lib/session";
import type { PickedPhoto } from "./invoicePhoto";

type PhotoKind = "purchases" | "cattle-deals" | "stock-moves" | "cost-entries";

/**
 * Procesa la foto (WebP), la sube con la URL firmada y borra el archivo local.
 * @param kind Tipo de documento al que pertenece.
 * @param id Id del documento.
 * @throws Error si la subida falla.
 */
export async function uploadInvoicePhoto(kind: PhotoKind, id: string, p: PickedPhoto): Promise<void> {
  // Lado largo 1280 px, WebP: igual que las fotos de campo (~120 KB).
  const local = await processPhoto(p.uri, p.width, p.height);
  try {
    const { url } = await api<{ url: string }>("POST", `/org/erp/photos/${kind}/${id}/upload-url`);
    const r = await FileSystem.uploadAsync(url, local.photoUri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "content-type": "image/webp" } });
    if (r.status >= 300) throw new Error(t("ui.photo.uploadFailed"));
    await api("POST", `/org/erp/photos/${kind}/${id}/uploaded`);
  } finally {
    await discardPhoto(local);
  }
}
