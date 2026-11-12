import { useQuery } from "@tanstack/react-query";
import { t as _t, type FarmHeatStressResponse, type HeatLevel } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtDateTime, fmtTemp } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { ErrorBox, Spinner } from "./ui";

/** Alto y color de cada nivel: el nivel no se distingue solo por el color. */
const BAR: Record<HeatLevel, string> = {
  normal: "h-2 bg-linea",
  alert: "h-3 bg-trigo",
  danger: "h-5 bg-alerta",
  emergency: "h-7 bg-peligro",
};

const hh = new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Estrés térmico del ganado (G-32): THI por hora de las próximas 48 horas. Datos de MET Norway. */
export function HeatStressCard({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["heat-stress", farmId],
    queryFn: () => get<FarmHeatStressResponse>(`/org/farms/${farmId}/heat-stress`),
  });
  if (q.isLoading) return <Spinner rows={1} h={64} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const level = d.summary.maxLevel;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="heat-title">
      <h3 id="heat-title" className="text-base font-semibold">
        {t("ui.heatTitle")}
      </h3>
      {!d.hours.length ? (
        <p className="text-sm text-tinta-2">{t("ui.heatNoData")}</p>
      ) : (
        <>
          <p className={`num text-sm ${level === "danger" || level === "emergency" ? "font-medium text-peligro" : ""}`} role={level === "normal" || level === "alert" ? undefined : "alert"}>
            {d.summary.dangerHours > 0
              ? `${t("ui.heatMax", { v: Math.round(d.summary.maxThi ?? 0), level: tk(`ui.heatLevel_${level}`) })} · ${t("ui.heatDangerHours", { n: d.summary.dangerHours })}${d.summary.firstDangerAt ? ` · ${t("ui.heatFirstDanger", { date: fmtDateTime(d.summary.firstDangerAt) })}` : ""}`
              : level === "alert"
                ? t("ui.heatMax", { v: Math.round(d.summary.maxThi ?? 0), level: tk(`ui.heatLevel_${level}`) })
                : t("ui.heatCalm")}
          </p>
          <div className="flex h-8 items-end gap-px" role="img" aria-label={t("ui.heatTitle")}>
            {d.hours.map((h) => (
              <span
                key={h.at}
                className={`flex-1 ${BAR[h.level]}`}
                title={t("ui.heatHourTitle", {
                  time: `${fmtDateTime(h.at).split(",")[0] ?? ""} ${hh.format(new Date(h.at))}`.trim(),
                  temp: fmtTemp(h.tempC),
                  hum: Math.round(h.humidityPct),
                  thi: Math.round(h.thi),
                })}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-2">
            {(["normal", "alert", "danger", "emergency"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`w-3 ${BAR[k]}`} aria-hidden /> {tk(`ui.heatLevel_${k}`)}
                {k === "normal" ? "" : ` (≥ ${d.thresholds[k]})`}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-tinta-2">{t("ui.heatHint")}</p>
      <p className="text-[11px] text-tinta-2">{_t("attribution.metNorway")}</p>
    </section>
  );
}
