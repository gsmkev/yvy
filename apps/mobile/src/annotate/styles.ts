/** Estilos de las pantallas de anotación. */
import { Platform, StyleSheet } from "react-native";
import { C, F, GUTTER, RADIUS, T, TOUCH } from "../ui/theme";

/** Hoja de estilos compartida por las pantallas de anotación. */
export const st = StyleSheet.create({
  warn: { marginTop: 16, padding: 12, borderRadius: RADIUS, backgroundColor: C.atencionSuave, color: C.atencion, fontFamily: F.sansMedium, fontSize: 15, lineHeight: 21 },
  progressWrap: { paddingHorizontal: GUTTER, paddingTop: 12 },
  progress: { flexDirection: "row", gap: 6 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.linea },
  numberRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 28, borderBottomWidth: 2, borderBottomColor: C.tinta, paddingBottom: 6 },
  numberInput: { ...T.number, flex: 1, flexBasis: 0, minWidth: 0, width: 0, padding: 0, minHeight: 72, borderWidth: 0, backgroundColor: "transparent", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}) },
  unit: { fontFamily: F.serifLight, fontSize: 28, color: C.tinta2 },
  textInput: { ...T.body, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}), minHeight: 140, marginTop: 20, textAlignVertical: "top", borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, padding: 14, backgroundColor: C.blanco },
  search: { ...T.body, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}), minHeight: TOUCH, borderWidth: 1.5, borderColor: C.lineaFuerte, borderRadius: RADIUS, paddingHorizontal: 14, backgroundColor: C.blanco, marginBottom: 12 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  thumb: { width: 104, height: 104, borderRadius: RADIUS },
  thumbX: { position: "absolute", top: 4, right: 4, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(30,36,25,0.75)", alignItems: "center", justifyContent: "center" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.lineaFuerte },
  doneMark: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accion, alignItems: "center", justifyContent: "center" },
  shutterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, paddingVertical: 24, backgroundColor: "#000" },
  shutter: { width: TOUCH + 20, height: TOUCH + 20, borderRadius: (TOUCH + 20) / 2, borderWidth: 6, borderColor: C.blanco, backgroundColor: C.accion },
});
