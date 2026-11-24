import { parseTaskComments, t } from "@yvy/shared";

export const dayLabel = () => {
  const d = new Date();
  const txt = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
export const commentsLabel = (json: string): string | null => {
  const n = parseTaskComments(json).length;
  return n === 0 ? null : n === 1 ? t("app.taskCommentsOne") : t("app.taskComments", { n });
};
/** Primer nombre sin el tratamiento ("Ing. Ana Villalba" -> "Ana"). */
export const firstName = (full: string) => full.replace(/^\s*(ing|dr|dra|lic|sr|sra|don|doña)\.?\s+/i, "").split(" ")[0] ?? "";
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });
