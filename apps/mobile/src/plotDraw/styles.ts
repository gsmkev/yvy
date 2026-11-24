import { StyleSheet } from "react-native";
import { C, GUTTER, RADIUS, T } from "../ui/theme";

export const st = StyleSheet.create({
  input: { ...T.body, minHeight: 56, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, backgroundColor: C.blanco },
  sheet: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: C.papel, borderRadius: RADIUS + 4, padding: GUTTER, elevation: 8 },
  vertex: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#D9A93A", borderWidth: 2.5, borderColor: "#ffffff" },
  vertexSel: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#D2462B" },
});
