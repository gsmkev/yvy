import { useQuery } from "@tanstack/react-query";
import { t as _t } from "@yvy/shared";
import { get } from "../lib/api";
import { fmtNum } from "../lib/format";
import { t } from "../lib/i18n";
import { Empty, ErrorBox, Spinner } from "./ui";

interface Spray {
  hours: {
    at: number;
    tempC: number | null;
    windKmh: number | null;
    humidityPct: number | null;
    precipMm: number | null;
    deltaT: number | null;
    ok: boolean;
  }[];
  windows: { from: number; to: number }[];
  limits: { windMinKmh: number; windMaxKmh: number; deltaTMin: number; deltaTMax: number };
}

const TZ = "America/Asuncion";
const hh = new Intl.DateTimeFormat("es-PY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayName = new Intl.DateTimeFormat("es-PY", { timeZone: TZ, weekday: "short", day: "numeric" });
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
const hourOf = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));

/** Línea de tiempo de las próximas horas: marca las aptas para pulverizar (A-13). Datos de MET Norway. */
export function SprayWindows({ farmId }: { farmId: string }) {
  const q = useQuery({
    queryKey: ["spray", farmId],
    queryFn: () => get<Spray>(`/org/farms/${farmId}/spray-windows`),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  if (!s.hours.length) return <Empty>{t("ui.sprayNoData")}</Empty>;

  const days = new Map<string, Spray["hours"]>();
  for (const h of s.hours) days.set(dayKey(h.at), [...(days.get(dayKey(h.at)) ?? []), h]);
  const today = dayKey(Date.now());
  const label = (ms: number) => (dayKey(ms) === today ? "hoy" : dayName.format(new Date(ms)).replace(".", ""));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-tinta-2">
        {t("ui.sprayCriteria", {
          wmin: s.limits.windMinKmh,
          wmax: s.limits.windMaxKmh,
          dmin: s.limits.deltaTMin,
          dmax: s.limits.deltaTMax,
        })}
      </p>
      <div className="flex flex-col gap-2" role="img" aria-label={t("ui.sprayTitle")}>
        {[...days.entries()].map(([key, hours]) => (
          <div key={key} className="grid grid-cols-[48px_1fr] items-center gap-2">
            <span className="text-xs text-tinta-2 capitalize">{label(hours[0]!.at)}</span>
            <div className="relative">
              <div className="grid h-6 grid-flow-col auto-cols-fr gap-px">
                {hours.map((h) => (
                  <span
                    key={h.at}
                    className={h.ok ? "bg-soja" : "bg-linea"}
                    title={t("ui.sprayHourTip", {
                      hour: hh.format(new Date(h.at)),
                      wind: h.windKmh === null ? "—" : fmtNum(h.windKmh),
                      temp: h.tempC === null ? "—" : fmtNum(h.tempC),
                      rh: h.humidityPct === null ? "—" : Math.round(h.humidityPct),
                      dt: h.deltaT === null ? "—" : fmtNum(h.deltaT),
                    })}
                  />
                ))}
              </div>
              <div className="num mt-0.5 flex justify-between text-[10px] text-tinta-2">
                <span>{String(hourOf(hours[0]!.at)).padStart(2, "0")}h</span>
                <span>{String((hourOf(hours[hours.length - 1]!.at) + 1) % 24).padStart(2, "0")}h</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-xs text-tinta-2">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-soja" aria-hidden /> {t("ui.sprayLegendOk")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-linea" aria-hidden /> {t("ui.sprayLegendNo")}
        </span>
      </div>
      {s.windows.length ? (
        <ul className="num divide-y divide-linea border-y border-linea text-sm">
          {s.windows.map((w) => (
            <li key={w.from} className="py-1.5">
              {t("ui.sprayWindowLine", { day: label(w.from), from: hh.format(new Date(w.from)), to: hh.format(new Date(w.to)) })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-tinta-2">{t("ui.sprayNone")}</p>
      )}
      <p className="text-[11px] text-tinta-2">{_t("attribution.metNorway")}</p>
    </div>
  );
}
