import { useState } from "react";
import { CROPS, ATTRIBUTION } from "@yvy/shared";
import { useSowingWindow } from "../lib/agri2";
import { fmtDate, fmtIsoDate, fmtPct } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { Empty, ErrorBox, Select, Spinner } from "./ui";

/** Ventana de siembra (A-05): humedad del suelo y pronóstico de los próximos días para un cultivo. */
export function SowingWindow({ farmId }: { farmId: string }) {
  const [crop, setCrop] = useState<(typeof CROPS)[number]>("soja");
  const q = useSowingWindow(farmId, crop);
  const d = q.data;
  return (
    <section aria-labelledby="sowing-window-h" className="flex flex-col gap-3">
      <h3 id="sowing-window-h" className="font-serif text-lg font-semibold">
        {t("ui.sow.winTitle")}
      </h3>
      <p className="text-sm text-tinta-2">{t("ui.sow.winIntro")}</p>
      <div>
        <Select
          aria-label={t("ui.common.crop")}
          value={crop}
          onChange={(e) => setCrop(e.target.value as (typeof CROPS)[number])}
          options={CROPS.filter((c) => c !== "otro").map((c) => ({ value: c, label: tk(`fields.crop.${c}`) }))}
        />
      </div>
      {q.isLoading && <Spinner rows={3} h={32} />}
      {q.error && <ErrorBox error={q.error} />}
      {d && d.days.length === 0 && <Empty title={t("ui.sow.winTitle")}>{t("ui.sow.winNoForecast")}</Empty>}
      {d && d.days.length > 0 && (
        <>
          <p className="text-sm">
            {d.best
              ? t(d.best.from === d.best.to ? "ui.sow.winBestOne" : "ui.sow.winBest", {
                  from: fmtIsoDate(d.best.from),
                  to: fmtIsoDate(d.best.to),
                })
              : t("ui.sow.winNone")}
          </p>
          <p className="num text-xs text-tinta-2">
            {d.soil === null
              ? t("ui.sow.winNoSoil")
              : t("ui.sow.winSoil", { pct: fmtPct(d.soil * 100), date: d.soilDate ? fmtIsoDate(d.soilDate) : "—" })}
            {d.forecastRunAt ? " · " + t("ui.sow.winForecast", { date: fmtDate(d.forecastRunAt) }) : ""}
          </p>
          <ul className="divide-y divide-linea border-y border-linea text-sm">
            {d.days.map((day) => (
              <li key={day.date} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <span className="num font-medium">{fmtIsoDate(day.date)}</span>
                {day.ok ? (
                  <span className="font-medium text-accion">
                    {t("ui.sow.winOk")}
                    {day.rainAhead ? <span className="font-normal text-tinta-2"> · {t("ui.sow.winRainAhead")}</span> : null}
                  </span>
                ) : (
                  <span className="text-tinta-2">
                    {t("ui.sow.winWait")}: {day.reasons.map((r) => t(`ui.sow.winReason_${r}` as "ui.sow.winReason_cold")).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-tinta-2">
            {t("ui.sow.winNote")} {t(ATTRIBUTION.nasaPower)} · {t(ATTRIBUTION.metNorway)}
          </p>
        </>
      )}
    </section>
  );
}
