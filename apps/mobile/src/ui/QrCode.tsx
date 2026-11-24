/** Código QR dibujado con SVG. */
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { C } from "./theme";
import { qrMatrix, qrPath } from "./qrMatrix";

/** Código QR dibujado con SVG: fondo blanco, margen de 4 módulos, un solo trazo. */
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => { const p = qrPath(qrMatrix(value)); return { d: p.d, n: p.size }; }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ alignSelf: "center", width: size, height: size, borderWidth: 1, borderColor: C.linea }}>
      <Svg width={size - 2} height={size - 2} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}
