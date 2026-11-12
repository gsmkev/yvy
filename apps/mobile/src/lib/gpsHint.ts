/** F-01: qué explicar mientras el GPS busca. El GPS no usa internet; tras prender el celular o viajar lejos puede tardar. */
import { useEffect, useState } from "react";
import { t } from "@yvy/shared";

export type GpsStage = "searching" | "slow" | "cold";

/** A los 5 s se aclara que busca satélites; a los 20 s se avisa que es un arranque en frío y que puede tardar. */
export const GPS_SLOW_MS = 5_000;
export const GPS_COLD_MS = 20_000;

export function gpsStage(elapsedMs: number): GpsStage {
  if (elapsedMs >= GPS_COLD_MS) return "cold";
  if (elapsedMs >= GPS_SLOW_MS) return "slow";
  return "searching";
}

/** Texto aclaratorio para la etapa; null mientras todavía no hace falta. */
export function gpsHintText(stage: GpsStage): string | null {
  if (stage === "cold") return t("app.gpsColdHint");
  if (stage === "slow") return t("app.gpsSlowHint");
  return null;
}

/** Etapa de la búsqueda en curso; vuelve a "searching" cuando `active` se apaga o cambia `resetKey`. */
export function useGpsStage(active: boolean, resetKey: unknown = null): GpsStage {
  const [stage, setStage] = useState<GpsStage>("searching");
  useEffect(() => {
    setStage("searching");
    if (!active) return;
    const slow = setTimeout(() => setStage("slow"), GPS_SLOW_MS);
    const cold = setTimeout(() => setStage("cold"), GPS_COLD_MS);
    return () => {
      clearTimeout(slow);
      clearTimeout(cold);
    };
  }, [active, resetKey]);
  return stage;
}
