/** Contenido del resumen compartido: cifras de la estancia, lotes y avisos vigentes. */
import { useRef } from "react";
import { ATTRIBUTION } from "@yvy/shared";
import { PageExport } from "../../components/PageExport";
import { DataTable, SectionHead, Stat, StatRow, type Column } from "../../components/ui";
import { cropName } from "../../lib/crops";
import { fmtDate, fmtHa, fmtMm, fmtNdvi } from "../../lib/format";
import { t, tk } from "../../lib/i18n";

/** Lo que devuelve el servidor para un enlace compartido. */
export interface SharedSummary {
  farm: { name: string; department: string | null; areaHa: number; plotCount: number };
  plots: { name: string; kind: string; crop: string | null; areaHa: number; ndvi: number | null; ndviAt: number | null }[];
  rain30: { mm: number | null; normalMm: number | null };
  alerts: { kind: string; severity: string; summary: string; validFrom: number; validTo: number | null }[];
  generatedAt: number;
  expiresAt: number;
}

type SharedPlot = SharedSummary["plots"][number];

const plotColumns: Column<SharedPlot>[] = [
  { id: "plot", header: t("ui.common.plot"), cell: (p) => p.name },
  { id: "crop", header: t("ui.common.crop"), hideBelow: "sm", cell: (p) => <span>{p.kind === "pasture" ? t("ui.common.pasture") : p.crop ? cropName(p.crop) : "—"}</span> },
  { id: "area", header: t("ui.common.area"), align: "right", cell: (p) => fmtHa(p.areaHa) },
  {
    id: "ndvi",
    header: t("ui.shared.vigor"),
    align: "right",
    cell: (p) =>
      p.ndvi === null ? (
        "—"
      ) : (
        <>
          {fmtNdvi(p.ndvi)}
          {p.ndviAt ? <span className="ml-2 text-xs text-tinta-2">{fmtDate(p.ndviAt)}</span> : null}
        </>
      ),
  },
];

function Header({ d, exportRoot }: { d: SharedSummary; exportRoot: React.RefObject<HTMLDivElement | null> }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-title leading-8">{d.farm.name}</h1>
        <p className="mt-1 text-sm text-tinta-2">{[t("ui.shared.title"), d.farm.department, t("ui.shared.readOnly")].filter(Boolean).join(", ")}</p>
      </div>
      {d.plots.length > 0 && <PageExport root={exportRoot} name={d.farm.name} />}
    </header>
  );
}

function Alerts({ alerts }: { alerts: SharedSummary["alerts"] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <SectionHead title={t("ui.alerts.title")} />
      {alerts.length === 0 ? (
        <p className="text-sm text-tinta-2">{t("ui.shared.noAlerts")}</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {alerts.map((a, i) => (
            <li key={i} className="border-b border-linea py-2.5">
              <span className="block font-medium">{tk(`ui.alert.kind_${a.kind}`)}</span>
              {a.summary}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Resumen de solo lectura de una estancia compartida. */
export function SharedBody({ d }: { d: SharedSummary }) {
  const body = useRef<HTMLDivElement>(null);
  return (
    <>
      <Header d={d} exportRoot={body} />
      <StatRow className="border-y border-linea py-5">
        <Stat label={t("ui.common.area")} value={fmtHa(d.farm.areaHa)} />
        <Stat label={t("ui.common.plots")} value={d.farm.plotCount} />
        <Stat label={t("ui.shared.rain30")} value={d.rain30.mm === null ? t("ui.shared.noData") : fmtMm(d.rain30.mm)} note={d.rain30.normalMm ? `${t("ui.shared.rainNormal")}: ${fmtMm(d.rain30.normalMm)}` : undefined} />
        {d.alerts.length > 0 && <Stat label={t("ui.alerts.title")} value={d.alerts.length} />}
      </StatRow>
      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section ref={body} className="flex min-w-0 flex-col gap-2">
          <SectionHead title={t("ui.common.plots")} />
          <DataTable columns={plotColumns} rows={d.plots} rowKey={(p) => `${p.name}|${p.areaHa}|${p.crop ?? ""}`} caption={t("ui.common.plots")} />
        </section>
        <Alerts alerts={d.alerts} />
      </div>
      <footer className="flex flex-col gap-1 text-xs text-tinta-2">
        <p>{[t("ui.shared.generated", { date: fmtDate(d.generatedAt) }), t("ui.shared.expires", { date: fmtDate(d.expiresAt) })].join(", ")}</p>
        <p>{[t(ATTRIBUTION.copernicus), t(ATTRIBUTION.chirps)].join(", ")}</p>
      </footer>
    </>
  );
}
