import { encode } from "jpeg-js";
import { describe, expect, it } from "vitest";
import { analyzeJpeg, analyzeLuma, base64ToBytes, photoIssueMessage, photoIssues, toLuma } from "../src/lib/photoQuality";

const W = 128;
const H = 96;

/** Imagen de prueba: gris por píxel → RGBA. */
const rgba = (f: (x: number, y: number) => number) => {
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = Math.max(0, Math.min(255, Math.round(f(x, y))));
      d.set([v, v, v, 255], (y * W + x) * 4);
    }
  return d;
};

/** Textura natural (como pasto o suelo): ruido de valor a varias escalas más un borde, determinista. */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const val = (x: number, y: number, s: number) => {
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  const fx = x / s - gx;
  const fy = y / s - gy;
  return hash(gx, gy) * (1 - fx) * (1 - fy) + hash(gx + 1, gy) * fx * (1 - fy) + hash(gx, gy + 1) * (1 - fx) * fy + hash(gx + 1, gy + 1) * fx * fy;
};
const natural = (x: number, y: number) =>
  110 + 60 * (val(x, y, 32) - 0.5) * 2 + 50 * (val(x, y, 8) - 0.5) * 2 + 30 * (val(x, y, 3) - 0.5) * 2 + (x % 40 < 20 ? 25 : -25);
/** `gain` escala el contraste y `base` mueve el brillo medio. */
const sharp = (gain = 1, base = 110) => rgba((x, y) => base + (natural(x, y) - 110) * gain);

/** Desenfoque de caja de radio r (lo que hace el movimiento a esta escala). */
const boxBlur = (src: Uint8Array, r: number) => {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          s += src[(yy * W + xx) * 4]!;
          n++;
        }
      const v = s / n;
      out.set([v, v, v, 255], (y * W + x) * 4);
    }
  return out;
};

const stats = (d: Uint8Array) => analyzeLuma(toLuma(d, W, H), W, H);
const viaJpeg = (d: Uint8Array) => {
  const jpg = encode({ data: d, width: W, height: H }, 90);
  return analyzeJpeg(new Uint8Array(jpg.data))!;
};

describe("calidad de la foto (X-09)", () => {
  it("una foto nítida y con luz no avisa nada", () => {
    expect(photoIssues(stats(sharp()))).toEqual([]);
    expect(photoIssueMessage(photoIssues(stats(sharp())))).toBeNull();
  });

  it("oscura: la luminancia media baja del umbral", () => {
    const dark = sharp(0.4, 20);
    expect(stats(dark).meanLuma).toBeLessThan(45);
    expect(photoIssues(stats(dark))).toContain("dark");
    expect(photoIssueMessage(["dark"])).toBe("La foto salió oscura, ¿la sacás de nuevo?");
  });

  it("movida: el desenfoque baja la varianza del laplaciano", () => {
    const base = sharp();
    const s0 = stats(base).blurVariance;
    const s1 = stats(boxBlur(base, 1)).blurVariance;
    const s3 = stats(boxBlur(base, 3)).blurVariance;
    expect(s0).toBeGreaterThan(s1);
    expect(s1).toBeGreaterThan(s3);
    // un desenfoque leve todavía pasa; uno marcado, no
    expect(photoIssues(stats(boxBlur(base, 1)))).toEqual([]);
    expect(photoIssues(stats(boxBlur(base, 3)))).toEqual(["blurry"]);
    expect(photoIssueMessage(["blurry"])).toBe("La foto salió movida, ¿la sacás de nuevo?");
  });

  it("oscura y movida a la vez, un solo mensaje", () => {
    const both = boxBlur(sharp(0.6, 25), 3);
    expect(photoIssues(stats(both))).toEqual(["dark", "blurry"]);
    expect(photoIssueMessage(["dark", "blurry"])).toBe("La foto salió oscura y movida, ¿la sacás de nuevo?");
  });

  it("un cielo liso y claro es poco detallado: se marca como movida (limitación conocida de la heurística)", () => {
    expect(photoIssues(stats(rgba(() => 200)))).toEqual(["blurry"]);
  });

  it("decodifica una miniatura JPEG real (jpeg-js) y mantiene el veredicto", () => {
    expect(photoIssues(viaJpeg(sharp()))).toEqual([]);
    expect(photoIssues(viaJpeg(sharp(0.4, 20)))).toContain("dark");
    expect(photoIssues(viaJpeg(boxBlur(sharp(), 3)))).toContain("blurry");
  });

  it("datos que no son JPEG no rompen: null", () => {
    expect(analyzeJpeg(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("base64 sin atob ni Buffer", () => {
    expect([...base64ToBytes("SG9sYQ==")]).toEqual([72, 111, 108, 97]);
    expect([...base64ToBytes("SG9sYQ")]).toEqual([72, 111, 108, 97]);
    expect([...base64ToBytes("TWFu\n")]).toEqual([77, 97, 110]);
  });
});
