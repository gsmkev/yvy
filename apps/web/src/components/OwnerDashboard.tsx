import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { get } from "../lib/api";
import { fmtNum } from "../lib/format";
import { fmtGs } from "../lib/money";
import { t, tk } from "../lib/i18n";
import { ErrorBox, SectionHead, Spinner, Stat } from "./ui";

interface Dashboard {
  /** Solo viene con el permiso de montos (dueño y administrador); null si no. */
  margin: { incomePyg: number; costPyg: number; marginPyg: number; entries: number } | null;
  areaByCrop: { crop: string | null; kind: "crop" | "pasture"; ha: number; plots: number }[];
  rain: { month: string; farmsWithData: number; mm: number | null; normalMm: number | null; pctOfNormal: number | null };
  alerts: { total: number; byKind: { kind: string; severity: string; n: number }[] };
  activity: { workers: number; activeWorkers7d: number; staff: number; activeStaff7d: number };
  records7d: { total: number; byWorkers: number; byKind: { kind: string; n: number }[] };
}

/** R-06: cifras sueltas para el dueño con varias estancias. Sin tarjetas: números y una línea de contexto. */
export function OwnerDashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dashboard>("/org/dashboard"), staleTime: 60_000 });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const label = (c: Dashboard["areaByCrop"][number]) =>
    c.kind === "pasture" ? t("ui.pasture") : c.crop ? tk(`ui.cropName_${c.crop}`) : t("ui.dashNoCrop");
  return (
    <section className="flex flex-col gap-5">
      <SectionHead title={t("ui.dashTitle")} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Stat
          label={t("ui.dashRainMonth")}
          value={d.rain.mm === null ? "—" : fmtNum(d.rain.mm)}
          unit={d.rain.mm === null ? undefined : "mm"}
          note={
            d.rain.normalMm === null
              ? t("ui.dashRainNoData")
              : t("ui.dashRainNormal", { normal: fmtNum(d.rain.normalMm), pct: d.rain.pctOfNormal ?? 0 })
          }
        />
        <Stat
          label={t("ui.activeAlerts")}
          value={d.alerts.total}
          tone={d.alerts.total ? "danger" : undefined}
          note={
            d.alerts.total ? (
              <Link to="/avisos" className="underline underline-offset-4">
                {d.alerts.byKind.map((a) => `${a.n} ${tk(`ui.alertKind_${a.kind}`).toLowerCase()}`).join(", ")}
              </Link>
            ) : (
              t("ui.dashNoAlerts")
            )
          }
        />
        <Stat
          label={t("ui.dashActivity")}
          value={`${d.activity.activeWorkers7d}/${d.activity.workers}`}
          note={t("ui.dashActivityNote", { staff: d.activity.activeStaff7d, total: d.activity.staff })}
        />
        {d.margin && (
          <Stat
            label={t("ui.dashMargin")}
            value={d.margin.entries ? fmtGs(d.margin.marginPyg) : "—"}
            tone={d.margin.entries && d.margin.marginPyg < 0 ? "danger" : undefined}
            note={
              d.margin.entries
                ? t("ui.dashMarginNote", { income: fmtGs(d.margin.incomePyg), cost: fmtGs(d.margin.costPyg) })
                : t("ui.dashMarginNone")
            }
          />
        )}
        <Stat
          label={t("ui.dashRecords")}
          value={d.records7d.total}
          note={t("ui.dashRecordsNote", { n: d.records7d.byWorkers })}
        />
      </div>
      {d.areaByCrop.length > 0 && (
        <div>
          <h3 className="eyebrow mb-1">{t("ui.dashAreaByCrop")}</h3>
          <ul className="divide-y divide-linea text-sm">
            {d.areaByCrop.map((c) => (
              <li key={`${c.kind}-${c.crop}`} className="num flex justify-between py-1.5">
                <span>{label(c)}</span>
                <span>
                  <span className="font-semibold">{fmtNum(c.ha)}</span> ha
                  <span className="ml-2 text-tinta-2">
                    {t(c.plots === 1 ? "ui.plotsCountOne" : "ui.plotsCountMany", { n: c.plots })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
