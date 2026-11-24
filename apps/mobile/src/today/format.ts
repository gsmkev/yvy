import { useEffect } from "react";
import { Alert } from "react-native";
import { parseTaskComments, t } from "@yvy/shared";
import { getDb } from "../lib/db";
import { isFieldRoleName } from "../office/team";

export const dayLabel = () => {
  const d = new Date();
  const txt = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
export const commentsLabel = (json: string): string | null => {
  const n = parseTaskComments(json).length;
  return n === 0 ? null : n === 1 ? t("app.task.commentsOne") : t("app.task.comments", { n });
};
/** Primer nombre sin el tratamiento ("Ing. Ana Villalba" -> "Ana"). */
export const firstName = (full: string) => full.replace(/^\s*(ing|dr|dra|lic|sr|sra|don|doña)\.?\s+/i, "").split(" ")[0] ?? "";
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });

type AlertLike = { id: string; severity: string };

/** Roles de oficina: 2 avisos y "Ver los N" (tienen la pantalla de Avisos); roles de campo: todos, compactos. */
export function alertsToShow<A extends AlertLike>(alerts: A[], role: string, pickedId: string | undefined): A[] {
  if (isFieldRoleName(role) || alerts.length <= 2) return alerts;
  return [...alerts].sort((x, y) => Number(y.id === pickedId) - Number(x.id === pickedId) || Number(y.severity === "warning") - Number(x.severity === "warning")).slice(0, 2);
}

/** Primera vez que se entra a otra organización: decir a cuál. */
export function useOrgEnteredNotice(orgId: string | undefined) {
  useEffect(() => {
    const name = getDb().getKv("org_entered_notice");
    if (!name) return;
    getDb().setKv("org_entered_notice", null);
    Alert.alert(t("app.common.enteredOrg", { name }));
  }, [orgId]);
}
