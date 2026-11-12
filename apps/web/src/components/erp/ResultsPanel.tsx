/** Costo por hectárea y por tonelada, y margen bruto por lote, cultivo y actividad (E-30, E-31). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, qs } from "../../lib/api";
import { fmtHa, fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";
import { fmtGs } from "../../lib/money";
import { useFarms } from "../../lib/queries";
import { Empty, ErrorBox, Field, Select, Spinner, Stat } from "../ui";
import { useSeasonList } from "./CostsPanel";

interface Figures {
  costPyg: number;
  incomePyg: number;
  marginPyg: number;
  areaHa: number;
  tons: number;
  costPerHa: number | null;
  marginPerHa: number | null;
  costPerTon: number | null;
}
interface Results {
  totals: Figures;
  byPlot: (Figures & { plotId: string | null; name: string | null; crop: string | null })[];
  byCrop: (Figures & { crop: string | null })[];
  byActivity: { activity: string; costPyg: number; incomePyg: number; marginPyg: number }[];
}

const gs = (n: number | null) => (n === null ? "" : fmtGs(n));
const tone = (n: number) => (n < 0 ? "text-peligro" : "");

export function ResultsPanel() {
  const farms = useFarms();
  const seasons = useSeasonList();
  const [f, setF] = useState({ farmId: "", seasonId: "" });
  const q = useQuery({
    queryKey: ["erp", "results", f],
    queryFn: () => get<Results>(`/org/erp/results${qs({ farmId: f.farmId || undefined, seasonId: f.seasonId || undefined })}`),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const th = "py-2 pr-4 text-right font-medium";
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-tinta-2">{t("ui.resultsIntro")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ui.costSeason")}>
          <Select value={f.seasonId} onChange={set("seasonId")} options={[{ value: "", label: t("ui.costAll") }, ...(seasons.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
        <Field label={t("ui.costFarm")}>
          <Select value={f.farmId} onChange={set("farmId")} options={[{ value: "", label: t("ui.costAll") }, ...(farms.data ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
      </div>
      {q.isLoading && <Spinner />}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data && (
        <>
          <div className="flex flex-wrap gap-8">
            <Stat label={t("ui.costTotalCost")} value={fmtGs(q.data.totals.costPyg)} />
            <Stat label={t("ui.costTotalIncome")} value={fmtGs(q.data.totals.incomePyg)} />
            <Stat label={t("ui.resultsMargin")} value={fmtGs(q.data.totals.marginPyg)} tone={q.data.totals.marginPyg < 0 ? "danger" : undefined} />
            {q.data.totals.costPerHa !== null && <Stat label={t("ui.resultsCostPerHa")} value={fmtGs(q.data.totals.costPerHa)} />}
            {q.data.totals.costPerTon !== null && <Stat label={t("ui.resultsCostPerTon")} value={fmtGs(q.data.totals.costPerTon)} />}
          </div>
          {q.data.byPlot.length === 0 ? (
            <Empty>{t("ui.erpEmpty")}</Empty>
          ) : (
            <>
              <Section title={t("ui.resultsByPlot")}>
                <thead>
                  <tr className="border-b border-linea text-left text-tinta-2">
                    <th className="py-2 pr-4 font-medium">{t("ui.orderPlot")}</th>
                    <th className={th}>{t("ui.resultsArea")}</th>
                    <th className={th}>{t("ui.costTotalCost")}</th>
                    <th className={th}>{t("ui.costTotalIncome")}</th>
                    <th className={th}>{t("ui.resultsMargin")}</th>
                    <th className={th}>{t("ui.resultsCostPerHa")}</th>
                    <th className={th}>{t("ui.resultsTons")}</th>
                    <th className="py-2 text-right font-medium">{t("ui.resultsCostPerTon")}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.byPlot.map((r) => (
                    <tr key={r.plotId ?? "none"} className="border-b border-linea">
                      <td className="py-2.5 pr-4 font-medium">{r.name ?? t("ui.resultsNoPlot")}</td>
                      <td className="num py-2.5 pr-4 text-right">{r.plotId ? fmtHa(r.areaHa) : ""}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtGs(r.costPyg)}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtGs(r.incomePyg)}</td>
                      <td className={`num py-2.5 pr-4 text-right ${tone(r.marginPyg)}`}>{fmtGs(r.marginPyg)}</td>
                      <td className="num py-2.5 pr-4 text-right">{gs(r.costPerHa)}</td>
                      <td className="num py-2.5 pr-4 text-right">{r.tons ? fmtNum(r.tons) : ""}</td>
                      <td className="num py-2.5 text-right">{gs(r.costPerTon)}</td>
                    </tr>
                  ))}
                </tbody>
              </Section>
              <Section title={t("ui.resultsByCrop")}>
                <tbody>
                  {q.data.byCrop.map((r) => (
                    <tr key={r.crop ?? "none"} className="border-b border-linea">
                      <td className="py-2.5 pr-4 font-medium">{r.crop ? tk(`ui.cropName_${r.crop}`) : t("ui.dashNoCrop")}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtHa(r.areaHa)}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtGs(r.costPyg)}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtGs(r.incomePyg)}</td>
                      <td className={`num py-2.5 pr-4 text-right ${tone(r.marginPyg)}`}>{fmtGs(r.marginPyg)}</td>
                      <td className="num py-2.5 text-right">{gs(r.costPerHa)}</td>
                    </tr>
                  ))}
                </tbody>
              </Section>
              <Section title={t("ui.resultsByActivity")}>
                <tbody>
                  {q.data.byActivity.map((r) => (
                    <tr key={r.activity} className="border-b border-linea">
                      <td className="py-2.5 pr-4 font-medium">{tk(`ui.activity_${r.activity}`)}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtGs(r.costPyg)}</td>
                      <td className="num py-2.5 pr-4 text-right">{fmtGs(r.incomePyg)}</td>
                      <td className={`num py-2.5 text-right ${tone(r.marginPyg)}`}>{fmtGs(r.marginPyg)}</td>
                    </tr>
                  ))}
                </tbody>
              </Section>
              <p className="text-xs text-tinta-2">{t("ui.resultsBeefNote")}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="border-b border-linea pb-2 font-serif text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}
