/** Ilustraciones planas del laboratorio (ejemplos, no fotos reales). Solo colores de la marca. */
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

const LINO = "#F1EEE4";
const SURCO = "#1E2419";
const SOJA = "#7A9A3F";
const TRIGO = "#D9A93A";
const ALERTA = "#D2462B";

/** Hoja de soja con manchas de roya y círculos finos que las marcan. */
export function LeafIllustration({ size = 280 }: { size?: number }) {
  const lesions: [number, number, number][] = [
    [112, 96, 7],
    [150, 120, 9],
    [96, 150, 6],
    [170, 164, 7],
    [128, 186, 5],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Hoja de soja de ejemplo con manchas marcadas">
      <Rect width="240" height="240" fill={LINO} />
      <Path d="M120 214 L120 232" stroke={SOJA} strokeWidth="6" strokeLinecap="round" />
      <Path d="M120 214 C40 190 28 100 120 20 C212 100 200 190 120 214 Z" fill={SOJA} />
      <Path d="M120 214 L120 40" stroke={LINO} strokeWidth="2" opacity={0.5} />
      <Path d="M120 160 L80 124 M120 130 L160 94 M120 100 L92 76 M120 176 L166 140" stroke={LINO} strokeWidth="1.5" opacity={0.4} />
      {lesions.map(([x, y, r]) => (
        <G key={`${x}-${y}`}>
          <Circle cx={x} cy={y} r={r} fill={ALERTA} />
          <Circle cx={x} cy={y} r={r + 9} fill="none" stroke={SURCO} strokeWidth="1.5" />
        </G>
      ))}
    </Svg>
  );
}

/** Paño blanco de sacudida con unas pocas chinches. */
export function BeatClothIllustration({ size = 280 }: { size?: number }) {
  const bugs: [number, number, number, string][] = [
    [70, 80, 20, SOJA],
    [150, 70, -30, SOJA],
    [110, 130, 60, TRIGO],
    [190, 120, 10, SOJA],
    [60, 170, -20, TRIGO],
    [140, 180, 40, SOJA],
    [200, 190, -50, SURCO],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Paño de sacudida de ejemplo con chinches">
      <Rect width="240" height="240" fill={LINO} />
      <Rect x="20" y="30" width="200" height="180" rx="6" fill="#FFFFFF" stroke={SURCO} strokeWidth="2" />
      <Line x1="20" y1="30" x2="220" y2="30" stroke={SURCO} strokeWidth="4" />
      {bugs.map(([x, y, rot, fill]) => (
        <G key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <Ellipse cx="0" cy="0" rx="9" ry="6" fill={fill} />
          <Circle cx="9" cy="0" r="3" fill={fill} />
          <Path d="M-4 -6 L-8 -11 M0 -6 L0 -12 M4 -6 L8 -11 M-4 6 L-8 11 M0 6 L0 12 M4 6 L8 11" stroke={SURCO} strokeWidth="1" strokeLinecap="round" />
        </G>
      ))}
    </Svg>
  );
}

/** Parche de pasto visto de costado, con suelo. */
export function PastureIllustration({ size = 280 }: { size?: number }) {
  const blades = Array.from({ length: 26 }, (_, i) => {
    const x = 20 + i * 8;
    const h = 60 + ((i * 37) % 50);
    const lean = ((i * 13) % 17) - 8;
    return { x, h, lean, fill: i % 5 === 0 ? TRIGO : SOJA };
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Parche de pasto de ejemplo">
      <Rect width="240" height="240" fill={LINO} />
      <Rect x="0" y="190" width="240" height="50" fill={SURCO} />
      {blades.map((b) => (
        <Path key={b.x} d={`M${b.x} 192 Q${b.x + b.lean / 2} ${192 - b.h / 2} ${b.x + b.lean} ${192 - b.h}`} stroke={b.fill} strokeWidth="4" strokeLinecap="round" fill="none" />
      ))}
      <Line x1="14" y1="192" x2="14" y2="112" stroke={SURCO} strokeWidth="1.5" />
      <Line x1="10" y1="112" x2="18" y2="112" stroke={SURCO} strokeWidth="1.5" />
    </Svg>
  );
}

/** Silueta de vaca de costado. */
export function CowIllustration({ size = 280 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Silueta de vaca de ejemplo">
      <Rect width="240" height="240" fill={LINO} />
      <Rect x="0" y="200" width="240" height="40" fill={SOJA} />
      <G fill={SURCO}>
        <Rect x="54" y="90" width="124" height="64" rx="26" />
        <Rect x="66" y="140" width="12" height="62" rx="4" />
        <Rect x="92" y="140" width="12" height="62" rx="4" />
        <Rect x="134" y="140" width="12" height="62" rx="4" />
        <Rect x="158" y="140" width="12" height="62" rx="4" />
        <Path d="M172 96 L206 78 L216 100 L200 128 L170 130 Z" />
        <Path d="M204 78 L212 62 L218 80 Z" />
        <Path d="M54 104 Q38 112 42 150" stroke={SURCO} strokeWidth="5" fill="none" strokeLinecap="round" />
      </G>
      <Ellipse cx="124" cy="118" rx="22" ry="12" fill={LINO} />
      <Circle cx="204" cy="94" r="3" fill={LINO} />
    </Svg>
  );
}
