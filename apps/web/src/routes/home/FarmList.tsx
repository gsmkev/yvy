import { Link } from "@tanstack/react-router";
import { Stat } from "../../components/ui";
import { areaUnitLabel, fmtAreaValue, fmtDate, fmtHa } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { FarmSummary } from "../../lib/types";

export function FarmList({ list }: { list: FarmSummary[] }) {
  return (
    <ul className="-mt-2 divide-y divide-linea border-y border-linea">
      {list.map((f) => (
        <li key={f.id}>
          <Link to="/estancias/$farmId" params={{ farmId: f.id }} className="group flex min-h-14 items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-body leading-5 font-semibold group-hover:underline">{f.name}</h2>
              <p className="num text-xs leading-4 text-tinta-2">
                {[
                  f.department,
                  fmtHa(f.areaHa),
                  `${f.plots} ${t("ui.plots").toLowerCase()}`,
                  f.lastRecordAt
                    ? `${t("ui.lastRecord").toLowerCase()} ${fmtDate(f.lastRecordAt)}`
                    : t("ui.neverRecorded").toLowerCase(),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {f.activeAlerts > 0 && (
              <span className="shrink-0 text-xs font-medium text-peligro">
                {t(f.activeAlerts === 1 ? "ui.alertsCountOne" : "ui.alertsCountMany", { n: f.activeAlerts })}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Superficie, registros de la semana y avisos de todas las estancias (para quien no ve el resumen del dueño). */
export function FarmTotals({ list }: { list: FarmSummary[] }) {
  const totalHa = list.reduce((a, f) => a + f.areaHa, 0);
  const alerts = list.reduce((a, f) => a + f.activeAlerts, 0);
  const records = list.reduce((a, f) => a + f.records7d, 0);
  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat label={t("ui.area")} value={fmtAreaValue(totalHa)} unit={areaUnitLabel()} />
      <Stat label={t("ui.records7d")} value={records} />
      <Stat label={t("ui.activeAlerts")} value={alerts} tone={alerts ? "danger" : undefined} />
    </div>
  );
}

/** Marco que abarca todas las estancias, con un margen. */
export function allFarmsBounds(list: FarmSummary[]): [number, number, number, number] | null {
  const pad = 0.01;
  return list.length
    ? [
        Math.min(...list.map((f) => f.minLon)) - pad,
        Math.min(...list.map((f) => f.minLat)) - pad,
        Math.max(...list.map((f) => f.maxLon)) + pad,
        Math.max(...list.map((f) => f.maxLat)) + pad,
      ]
    : null;
}
