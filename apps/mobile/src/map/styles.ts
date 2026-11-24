/** Estilos compartidos de las piezas del mapa. */
import { StyleSheet } from "react-native";
import { C, F, GUTTER, RADIUS } from "../ui/theme";

/** Hoja de estilos del mapa (centrado y ficha inferior). */
export const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sheet: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: C.papel, borderRadius: RADIUS + 4, padding: GUTTER, elevation: 8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  sheetLinks: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  sheetLink: { paddingHorizontal: 0, marginRight: 20 },
  toolbar: { position: "absolute", top: 12, right: 12 },
  topLeft: { position: "absolute", top: 12, left: 12, right: 76, gap: 8 },
  coords: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14, minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  panel: { backgroundColor: C.papel, borderRadius: RADIUS, paddingHorizontal: 14 },
  label: { fontFamily: F.sansMedium, fontSize: 12, color: "#ffffff", textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 }, maxWidth: 110 },
  sample: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: "#D9A93A", borderWidth: 2, borderColor: "#1E2419", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  sampleText: { fontFamily: F.sansMedium, fontSize: 11, color: "#1E2419" },
  attr: { position: "absolute", bottom: 6, left: 12, fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,0.7)" },
});
