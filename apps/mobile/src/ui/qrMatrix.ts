/** Matriz de módulos de un QR (true = oscuro). JS puro, sin React Native, para poder probarla. */
import qrcode from "qrcode-generator";

/** Matriz de módulos del QR de un texto; `true` es módulo oscuro. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Un solo trazo SVG con todos los módulos oscuros (cada uno 1×1, con `margin` módulos de borde). */
export function qrPath(m: boolean[][], margin = 4): { d: string; size: number } {
  let d = "";
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + margin} ${r + margin}h1v1h-1z`; }));
  return { d, size: m.length + margin * 2 };
}
