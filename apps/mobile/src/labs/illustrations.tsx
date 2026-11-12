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
  // Vaca de costado (como se saca la foto) con los puntos que mira la condición corporal marcados en trigo.
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Silueta de vaca de ejemplo">
      <Rect width="240" height="240" fill={LINO} />
      <Rect x="0" y="198" width="240" height="42" fill={SOJA} />
      <G fill={SURCO}>
        {/* Cuerpo, cuello y cabeza en una sola silueta */}
        <Path d="M50 104 Q54 90 72 88 L150 86 Q166 86 178 96 L200 100 Q212 104 216 122 Q218 132 208 134 L196 132 Q186 130 180 138 Q176 150 166 154 L82 156 Q62 156 54 142 Q48 126 50 104 Z" />
        {/* Patas */}
        <Rect x="62" y="146" width="11" height="54" rx="4" />
        <Rect x="80" y="148" width="11" height="52" rx="4" />
        <Rect x="146" y="148" width="11" height="52" rx="4" />
        <Rect x="162" y="146" width="11" height="54" rx="4" />
        {/* Oreja y cuerno */}
        <Path d="M188 100 L176 92 L192 96 Z" />
        <Path d="M196 99 Q198 90 206 88 Q200 94 200 100 Z" />
      </G>
      {/* Cola con mechón */}
      <Path d="M52 100 Q40 120 44 160" stroke={SURCO} strokeWidth="4" fill="none" strokeLinecap="round" />
      <Ellipse cx="44" cy="166" rx="5" ry="8" fill={SURCO} />
      {/* Costillas apenas marcadas */}
      <Path d="M104 112 Q108 128 104 142 M116 112 Q120 128 116 142 M128 112 Q132 128 128 142" stroke={LINO} strokeOpacity="0.35" strokeWidth="2" fill="none" />
      {/* Ojo */}
      <Circle cx="202" cy="112" r="2.5" fill={LINO} />
      {/* Puntos que evalúa: base de la cola, cadera, costillas cortas */}
      <G stroke={TRIGO} strokeWidth="2.5" fill="none">
        <Circle cx="56" cy="98" r="9" />
        <Circle cx="76" cy="100" r="9" />
        <Circle cx="116" cy="104" r="9" />
      </G>
    </Svg>
  );
}

/** Macolla de gramínea con la espiga todavía cerrada, vista de costado. */
export function WeedIllustration({ size = 280 }: { size?: number }) {
  const blades = [
    "M120 200 Q96 150 70 96",
    "M120 200 Q108 140 100 70",
    "M120 200 Q122 130 126 56",
    "M120 200 Q140 140 156 78",
    "M120 200 Q150 160 184 112",
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Macolla de maleza de ejemplo">
      <Rect width="240" height="240" fill={LINO} />
      <Rect x="0" y="198" width="240" height="42" fill={SURCO} />
      {blades.map((d) => (
        <Path key={d} d={d} stroke={SOJA} strokeWidth="7" strokeLinecap="round" fill="none" />
      ))}
      <Circle cx="126" cy="56" r="22" fill="none" stroke={TRIGO} strokeWidth="2.5" />
    </Svg>
  );
}

/** Caravana amarilla en una oreja y, abajo, una etiqueta de producto con sus renglones. */
export function TagLabelIllustration({ size = 280 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" accessibilityLabel="Caravana y etiqueta de producto de ejemplo">
      <Rect width="240" height="240" fill={LINO} />
      <Path d="M24 8 Q60 -6 96 10 L100 54 Q70 70 28 56 Z" fill={SURCO} />
      <Rect x="58" y="34" width="52" height="44" rx="6" fill={TRIGO} stroke={SURCO} strokeWidth="2" />
      <Path d="M70 50 H98 M70 62 H92" stroke={SURCO} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="58" cy="44" r="4" fill={SURCO} />
      <Rect x="130" y="40" width="82" height="34" fill="none" stroke={ALERTA} strokeWidth="2" strokeDasharray="5 4" />
      <Rect x="28" y="112" width="184" height="104" fill="#FFFFFF" stroke={SURCO} strokeWidth="2" />
      <Rect x="28" y="112" width="184" height="22" fill={SOJA} />
      <Path d="M42 154 H150 M42 170 H182 M42 186 H130 M42 202 H166" stroke={SURCO} strokeWidth="3" strokeLinecap="round" opacity={0.6} />
      <Rect x="36" y="146" width="116" height="16" fill="none" stroke={ALERTA} strokeWidth="2" strokeDasharray="5 4" />
    </Svg>
  );
}
