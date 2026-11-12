/** M-19: rasteriza los íconos de los puntos de interés (Lucide) para usarlos como imágenes del mapa. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND, POI_KINDS, type PoiKind } from "@yvy/shared";
import { POI_ICON } from "./icons";

const SIZE = 28;
const RATIO = 2;

export const poiImageId = (kind: string) => `poi-${kind}`;

/** Ícono del tipo en surco sobre fondo transparente; el disco lo pone la capa de círculos. */
function render(kind: PoiKind): Promise<ImageData> {
  const svg = renderToStaticMarkup(
    createElement(POI_ICON[kind], { size: 16, strokeWidth: 2.25, color: BRAND.surco, xmlns: "http://www.w3.org/2000/svg" }),
  );
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = SIZE * RATIO;
      const g = c.getContext("2d")!;
      g.scale(RATIO, RATIO);
      g.drawImage(img, (SIZE - 16) / 2, (SIZE - 16) / 2, 16, 16);
      resolve(g.getImageData(0, 0, SIZE * RATIO, SIZE * RATIO));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Agrega al mapa la imagen de cada tipo (una sola vez). */
export async function addPoiImages(map: {
  hasImage(id: string): boolean;
  addImage(id: string, d: ImageData, o: { pixelRatio: number }): void;
}) {
  await Promise.all(
    POI_KINDS.map(async (k) => {
      try {
        const data = await render(k);
        if (!map.hasImage(poiImageId(k))) map.addImage(poiImageId(k), data, { pixelRatio: RATIO });
      } catch {
        /* sin ícono: queda el disco */
      }
    }),
  );
}
