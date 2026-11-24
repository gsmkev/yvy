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

/** Cifras sueltas para el dueño con varias estancias. Sin tarjetas: números y una línea de contexto. */
export function OwnerDashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dashboard>("/org/dashboard"), staleTime: 60_000 });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const label = (c: Dashboard["areaByCrop"][number]) =>
    c.kind === "pasture" ? t("ui.common.pasture") : c.crop ? tk(`ui.crop.name_${c.crop}`) : t("ui.dash.noCrop");
  const maxHa = Math.max(1, ...d.areaByCrop.map((c) => c.ha));
  const notes = [
    d.rain.normalMm === null
      ? t("ui.dash.rainNoData")
      : t("ui.dash.rainMonth") +
        ": " +
        t("ui.dash.rainNormal", { normal: fmtNum(d.rain.normalMm), pct: d.rain.pctOfNormal ?? 0 }),
    d.margin &&
      (d.margin.entries
        ? t("ui.dash.marginNote", { income: fmtGs(d.margin.incomePyg), cost: fmtGs(d.margin.costPyg) })
        : t("ui.dash.marginNone")),
    t("ui.dash.activityNote", { staff: d.activity.activeStaff7d, total: d.activity.staff }),
  ].filter(Boolean);
  return (
    <section className="flex flex-col gap-4">
      <SectionHead title={t("ui.dash.title")} />
      <div className="flex flex-wrap gap-x-7 gap-y-4">
        <Stat
          label={t("ui.dash.rainMonth")}
          value={d.rain.mm === null ? "—" : fmtNum(d.rain.mm)}
          unit={d.rain.mm === null ? undefined : "mm"}
        />
        <Stat label={t("ui.common.activeAlerts")} value={d.alerts.total} tone={d.alerts.total ? "danger" : undefined} />
        <Stat label={t("ui.dash.records")} value={d.records7d.total} />
        <Stat label={t("ui.dash.activity")} value={`${d.activity.activeWorkers7d}/${d.activity.workers}`} />
        {d.margin && (
          <Stat
            label={t("ui.dash.margin")}
            value={d.margin.entries ? fmtGs(d.margin.marginPyg) : "—"}
            tone={d.margin.entries && d.margin.marginPyg < 0 ? "danger" : undefined}
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-tinta-2">
        {d.alerts.total > 0 && (
          <Link to="/avisos" className="underline underline-offset-4">
            {d.alerts.byKind.map((a) => `${a.n} ${tk(`ui.alert.kind_${a.kind}`).toLowerCase()}`).join(", ")}
          </Link>
        )}
        {notes.map((n) => (
          <p key={String(n)}>{n}</p>
        ))}
      </div>
      {d.areaByCrop.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">{t("ui.dash.areaByCrop")}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {d.areaByCrop.map((c) => (
              <li key={`${c.kind}-${c.crop}`}>
                <div className="num flex items-baseline justify-between gap-3">
                  <span>{label(c)}</span>
                  <span>
                    <span className="font-semibold">{fmtNum(c.ha)}</span> ha
                    <span className="ml-2 text-xs text-tinta-2">
                      {t(c.plots === 1 ? "ui.plots.countOne" : "ui.plots.countMany", { n: c.plots })}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surco/10" aria-hidden>
                  <div
                    className={`h-1.5 rounded-full ${c.kind === "pasture" ? "bg-trigo" : "bg-soja"}`}
                    style={{ width: `${Math.max(3, (100 * c.ha) / maxHa)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
