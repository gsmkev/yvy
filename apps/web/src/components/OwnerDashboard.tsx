/** Cifras sueltas para el dueño con varias estancias. Sin tarjetas: números y una línea de contexto. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { get } from "../lib/api";
import { fmtNum } from "../lib/format";
import { fmtGs } from "../lib/money";
import { t, tk } from "../lib/i18n";
import { ErrorBox, Spinner, Stat, StatRow } from "./ui";

interface Dashboard {
  /** Solo viene con el permiso de montos (dueño y administrador); null si no. */
  margin: { incomePyg: number; costPyg: number; marginPyg: number; entries: number } | null;
  areaByCrop: { crop: string | null; kind: "crop" | "pasture"; ha: number; plots: number }[];
  rain: { month: string; farmsWithData: number; mm: number | null; normalMm: number | null; pctOfNormal: number | null };
  alerts: { total: number; byKind: { kind: string; severity: string; n: number }[] };
  activity: { workers: number; activeWorkers7d: number; staff: number; activeStaff7d: number };
  records7d: { total: number; byWorkers: number; byKind: { kind: string; n: number }[] };
}

/** Ventas, costos y margen de los últimos 12 meses, en filas. */
function MarginRows({ margin }: { margin: NonNullable<Dashboard["margin"]> }) {
  if (!margin.entries) return <p className="text-sm text-tinta-2">{t("ui.dash.marginNone")}</p>;
  const rows: [string, number, boolean][] = [
    [t("ui.dash.sales"), margin.incomePyg, false],
    [t("ui.dash.costs"), margin.costPyg, false],
    [t("ui.dash.margin"), margin.marginPyg, true],
  ];
  return (
    <dl className="num divide-y divide-linea border-y border-linea text-sm">
      {rows.map(([label, value, total]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 py-2">
          <dt className={total ? "font-semibold" : "text-tinta-2"}>{label}</dt>
          <dd className={total ? `font-serif text-lg font-semibold ${value < 0 ? "text-peligro" : ""}` : ""}>{fmtGs(value)}</dd>
        </div>
      ))}
    </dl>
  );
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
  return (
    <section className="flex flex-col gap-4 border-t border-linea pt-5">
      <h2 className="font-serif text-lg font-semibold">{t("ui.dash.title")}</h2>
      <StatRow>
        <Stat
          label={t("ui.dash.rainMonth")}
          value={d.rain.mm === null ? "—" : fmtNum(d.rain.mm)}
          unit={d.rain.mm === null ? undefined : "mm"}
          note={d.rain.pctOfNormal === null ? undefined : t("ui.dash.rainPct", { pct: d.rain.pctOfNormal })}
        />
        <Stat
          label={t("ui.common.activeAlerts")}
          value={d.alerts.total}
          tone={d.alerts.total ? "danger" : undefined}
          note={
            d.alerts.total > 0 && (
              <Link to="/avisos" className="underline underline-offset-4">
                {t("ui.dash.seeAlerts")}
              </Link>
            )
          }
        />
        <Stat label={t("ui.dash.records")} value={d.records7d.total} />
        <Stat
          label={t("ui.dash.activity")}
          value={`${d.activity.activeWorkers7d}/${d.activity.workers}`}
          note={t("ui.dash.officeNote", { staff: d.activity.activeStaff7d, total: d.activity.staff })}
        />
      </StatRow>
      {d.margin && <MarginRows margin={d.margin} />}
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
