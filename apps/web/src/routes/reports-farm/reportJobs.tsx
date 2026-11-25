/** Generación de los PDF de la pantalla de informes: campaña por lote, auditoría e informe para el banco. */
import { localDate, gaugeBetween, normalBetween, rainBetween } from "@yvy/shared";
import { get } from "../../lib/api";
import { download } from "../../lib/exports";
import { buildAuditReport } from "../../lib/auditReportData";
import { fetchAllRecords } from "../../lib/queries";
import { fetchClimate, fetchNdvi, mapLimit, seasonStart, vigorSummary } from "../../lib/reportsData";
import type { Alert, Farm, Plot, Poi, Product } from "../../lib/types";

/** PDF de la campaña de un lote: registros, lluvia contra lo normal, pluviómetros y vigor. */
export async function seasonPdf(farmId: string, f: Farm, plot: Plot): Promise<void> {
    if (!plot) return;
    const to = localDate(Date.now());
    const from = seasonStart(plot.sowingDate, to);
    const days = Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 2;
    const fromMs = Date.parse(`${from}T00:00:00-03:00`);
    const toMs = Date.parse(`${to}T23:59:59-03:00`);
    const [records, climate, ndvi] = await Promise.all([
      fetchAllRecords({ farmId, plotId: plot.id, from: fromMs, to: toMs }, 2000),
      fetchClimate(farmId, days),
      fetchNdvi(plot.id),
    ]);
    const [{ pdf }, { SeasonReport }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("../../lib/reportsPdf"),
    ]);
    const blob = await pdf(
      <SeasonReport
        farm={f}
        plot={plot}
        from={from}
        to={to}
        records={records}
        rainMm={rainBetween(climate.daily, from, to)}
        normalMm={normalBetween(climate.climatology, from, to)}
        gaugeMm={gaugeBetween(climate.gauge, fromMs, toMs)}
        ndvi={ndvi.series.filter((p) => p.acquiredAt >= fromMs)}
      />,
    ).toBlob();
    download(blob, `campana-${plot.name}-${to}.pdf`);
}

/** Aplicaciones del año con productos, dosis, carencia, distancia a agua o vivienda y operadores. */
export async function auditPdf(farmId: string, f: Farm, pois: Poi[]): Promise<void> {
    const to = localDate(Date.now());
    const from = `${to.slice(0, 4)}-01-01`;
    const fromMs = Date.parse(`${from}T00:00:00-03:00`);
    const toMs = Date.parse(`${to}T23:59:59-03:00`);
    const [applications, harvests, products] = await Promise.all([
      fetchAllRecords({ farmId, kind: "application", from: fromMs, to: toMs }, 2000),
      fetchAllRecords({ farmId, kind: "harvest", from: fromMs, to: toMs }, 500),
      get<Product[]>("/org/products"),
    ]);
    const data = buildAuditReport({ from, to, applications, harvests, products, pois: pois });
    const [{ pdf }, { AuditReport }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("../../lib/auditReportPdf"),
    ]);
    const blob = await pdf(<AuditReport from={data.from} to={data.to} applications={data.applications} operators={data.operators} totalHa={data.totalHa} flagged={data.flagged} farm={f} generatedAt={Date.now()} />).toBlob();
    download(blob, `auditoria-${f.name}-${to}.pdf`);
}

/** Informe para el banco: lotes con su vigor, lluvia de 30 días y de la campaña, y avisos activos. */
export async function bankPdf(farmId: string, f: Farm, plots: Plot[]): Promise<void> {
    const to = localDate(Date.now());
    const sowings = plots.filter((p) => p.kind === "crop" && p.sowingDate).map((p) => p.sowingDate!);
    const seasonFrom = seasonStart(sowings.length ? sowings.sort()[0]! : null, to);
    const days = Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${seasonFrom}T00:00:00Z`)) / 86_400_000) + 2;
    const from30 = new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    const [climate, alerts, series] = await Promise.all([
      fetchClimate(farmId, Math.max(days, 31)),
      get<Alert[]>(`/org/alerts?farmId=${farmId}&active=1`),
      mapLimit(plots.slice(0, 80), 6, (p) => fetchNdvi(p.id).catch(() => null)),
    ]);
    const since = Date.now() - 365 * 86_400_000;
    const vigor = new Map(
      plots.slice(0, 80).map((p, i) => [p.id, vigorSummary((series[i]?.series ?? []).filter((x) => x.acquiredAt >= since))]),
    );
    const [{ pdf }, { BankReport }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("../../lib/reportsBankPdf"),
    ]);
    const blob = await pdf(
      <BankReport
        farm={f}
        plots={plots}
        vigor={vigor}
        rain30={rainBetween(climate.daily, from30, to)}
        normal30={normalBetween(climate.climatology, from30, to)}
        rainSeason={rainBetween(climate.daily, seasonFrom, to)}
        normalSeason={normalBetween(climate.climatology, seasonFrom, to)}
        seasonFrom={seasonFrom}
        to={to}
        alerts={alerts}
        generatedAt={Date.now()}
      />,
    ).toBlob();
    download(blob, `informe-banco-${f.name}-${to}.pdf`);
}
