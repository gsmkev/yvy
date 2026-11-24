import { StyleSheet } from "react-native";
import { C, RADIUS } from "../ui/theme";

export const st = StyleSheet.create({
  alert: { borderRadius: RADIUS, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  seeAll: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  alertStrong: { backgroundColor: C.peligro },
  alertSoft: { backgroundColor: C.atencionSuave },
  vote: { flexDirection: "row", alignItems: "center", gap: 20, minHeight: 44 },
  voteBtn: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  alertPicked: { borderWidth: 3, borderColor: C.tinta },
  task: { gap: 4, paddingVertical: 4 },
  taskMain: { flex: 1, minWidth: 0, minHeight: 56, justifyContent: "center", paddingVertical: 4 },
  checkHit: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  stats: { gap: 8, paddingRight: 8 },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.lineaFuerte },
});
