import { t } from "@yvy/shared";
import type { Age } from "./httpCache";

/** "15 min", "3 h", "2 días": hace cuánto se bajó un dato. */
export function ageText(a: Age): string {
  switch (a.unit) {
    case "now":
      return t("app.agoNow");
    case "min":
      return t("app.agoMin", { n: a.n });
    case "h":
      return t("app.agoHours", { n: a.n });
    case "d":
      return t(a.n === 1 ? "app.agoDayOne" : "app.agoDays", { n: a.n });
  }
}
