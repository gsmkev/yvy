/** Códigos QR de los puntos de interés (F-28): la web los imprime para pegar en un bebedero o silo; la app los escanea. */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const POI_QR = new RegExp(`^yvy://poi\\?id=(${UUID})$`, "i");

/** Contenido del QR de un punto. Solo lleva el id: el nombre y el tipo se leen del celular (sin señal) y no se pegan en el código. */
export const poiQrPayload = (poiId: string): string => `yvy://poi?id=${poiId}`;

/** Id del punto si el texto escaneado es un QR de Yvy de un punto; null si no. */
export function parsePoiQr(data: string): string | null {
  const m = POI_QR.exec(data.trim());
  return m ? m[1]!.toLowerCase() : null;
}
