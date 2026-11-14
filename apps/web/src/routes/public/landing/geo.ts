/** Geometrías de ejemplo de la landing (no son datos de nadie) y colores de las capas. */
export type Pt = [number, number];
export const toPath = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");
export const centroid = (pts: Pt[]): Pt => [
  pts.reduce((a, p) => a + p[0], 0) / pts.length,
  pts.reduce((a, p) => a + p[1], 0) / pts.length,
];

/** Rampa NDVI del producto: #B5562E #D9A93A #C9C46A #7A9A3F #3F6B35. */
export const VIGOR = ["#B5562E", "#D9A93A", "#C9C46A", "#7A9A3F", "#3F6B35"];

/** Hero plots traced on the real field edges of hero.jpg (1920x1088). */
const R = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export const heroPlots: { pts: Pt[]; v: number }[] = [
  { pts: R(482, 12, 942, 284), v: 2 },
  { pts: R(978, 12, 1426, 284), v: 0 },
  { pts: R(472, 314, 946, 668), v: 4 },
  { pts: R(978, 314, 1446, 668), v: 2 },
  { pts: R(1478, 314, 1908, 668), v: 4 },
  { pts: R(466, 698, 944, 1076), v: 1 },
  { pts: R(978, 698, 1450, 1076), v: 1 },
];

export type CropKey = "Maiz" | "Trigo" | "Soja" | "Pasto" | "Rastrojo";
export interface FarmPlot {
  kind: "lote" | "potrero";
  n: number;
  crop: CropKey;
  ha: number;
  pts: Pt[];
  vigor: number;
  lluvia: number;
  temp: number;
  /** Balance hídrico del lote (lluvia menos evapotranspiración), 0 = déficit fuerte, 1 = sobrante. */
  balance: number;
  series: number[];
}

/** Farm map plots over an 800x500 canvas, with per-layer values 0..1. */
export const farmPlots: FarmPlot[] = [
  { kind: "lote", n: 1, crop: "Maiz", ha: 142, pts: [[30, 30], [240, 24], [250, 170], [36, 180]], vigor: 0.82, lluvia: 0.55, temp: 0.45, balance: 0.6, series: [0.2, 0.35, 0.55, 0.7, 0.8, 0.82] },
  { kind: "lote", n: 2, crop: "Trigo", ha: 98, pts: [[260, 24], [440, 30], [430, 160], [262, 168]], vigor: 0.58, lluvia: 0.5, temp: 0.2, balance: 0.5, series: [0.3, 0.42, 0.5, 0.56, 0.6, 0.58] },
  { kind: "lote", n: 3, crop: "Soja", ha: 166, pts: [[460, 32], [770, 40], [762, 190], [452, 172]], vigor: 0.9, lluvia: 0.7, temp: 0.5, balance: 0.75, series: [0.2, 0.4, 0.65, 0.82, 0.9, 0.9] },
  { kind: "lote", n: 4, crop: "Soja", ha: 186, pts: [[36, 200], [250, 190], [256, 340], [44, 352]], vigor: 0.71, lluvia: 0.32, temp: 0.62, balance: 0.35, series: [0.18, 0.36, 0.55, 0.68, 0.73, 0.71] },
  { kind: "lote", n: 5, crop: "Trigo", ha: 204, pts: [[270, 186], [500, 196], [494, 350], [266, 340]], vigor: 0.45, lluvia: 0.28, temp: 0.15, balance: 0.3, series: [0.25, 0.35, 0.42, 0.47, 0.46, 0.45] },
  { kind: "lote", n: 6, crop: "Trigo", ha: 77, pts: [[520, 210], [766, 214], [760, 320], [514, 330]], vigor: 0.3, lluvia: 0.2, temp: 0.1, balance: 0.2, series: [0.3, 0.33, 0.34, 0.32, 0.31, 0.3] },
  { kind: "potrero", n: 2, crop: "Pasto", ha: 310, pts: [[44, 372], [380, 362], [390, 476], [50, 480]], vigor: 0.62, lluvia: 0.6, temp: 0.7, balance: 0.55, series: [0.5, 0.55, 0.6, 0.64, 0.62, 0.62] },
  { kind: "lote", n: 7, crop: "Rastrojo", ha: 121, pts: [[400, 360], [760, 346], [766, 474], [410, 480]], vigor: 0.15, lluvia: 0.45, temp: 0.85, balance: 0.15, series: [0.1, 0.12, 0.15, 0.14, 0.15, 0.15] },
];

export const mix = (a: string, b: string, t: number) => `color-mix(in oklab, ${b} ${Math.round(t * 100)}%, ${a})`;
export const vigorColor = (v: number) => VIGOR[Math.min(4, Math.floor(v * 5))]!;
