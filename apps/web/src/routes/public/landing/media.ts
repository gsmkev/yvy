/**
 * Imágenes de la landing: WebP en /landing (apps/web/public/landing), con varios anchos para srcset.
 * El hero pesa ≤ 250 KB en su versión más grande; el resto se carga diferido.
 */
const dir = "/landing";

const img = (base: string, widths: number[], fallback: number, w: number, h: number) => ({
  src: `${dir}/${base}-${fallback}.webp`,
  srcSet: widths.map((x) => `${dir}/${base}-${x}.webp ${x}w`).join(", "),
  width: w,
  height: h,
});

export const media = {
  /** 1920×1088; las parcelas dibujadas encima están medidas sobre estas proporciones. */
  hero: img("hero", [1024, 1440, 1920], 1440, 1920, 1088),
  cta: img("cta", [640, 1280, 1920], 1280, 1920, 1088),
  satellite: img("satellite", [640, 1280], 1280, 1280, 960),
  /** Fotos ilustrativas de personas del campo: no son clientes ni llevan nombre. */
  audiences: [1, 2, 3, 4, 5].map((i) => img(`aud-${i}`, [384, 768], 768, 768, 960)),
};
