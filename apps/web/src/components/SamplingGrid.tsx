/** Grilla de muestreo de suelo sobre el lote (M-18): un punto cada 5 o 10 ha, numerados, para imprimir o bajar. */
import { useMemo, useState } from "react";
import { samplingGrid, SAMPLING_HA, type Area } from "@yvy/geo";
import { BRAND } from "@yvy/shared";
import { download } from "../lib/exports";
import { t } from "../lib/i18n";
import { projector, plotPath } from "../lib/samplingPdf";
import { tableToCsv } from "../lib/tableExport";
import type { Farm, Plot } from "../lib/types";
import { Button, ErrorBox } from "./ui";

const W = 320;
const H = 220;

export function SamplingGrid({ plot, farm }: { plot: Plot; farm: Farm | undefined }) {
  const [open, setOpen] = useState(false);
  const [ha, setHa] = useState<number>(SAMPLING_HA[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const points = useMemo(() => (open ? samplingGrid(JSON.parse(plot.geometry) as Area, ha) : []), [open, plot.geometry, ha]);
  const { px, py } = useMemo(() => projector(plot, W, H), [plot.geometry]);

  const pdfFile = async () => {
    if (!farm) return;
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { SamplingReport }] = await Promise.all([import("@react-pdf/renderer"), import("../lib/samplingPdf")]);
      const blob = await pdf(<SamplingReport farm={farm} plot={plot} haPerPoint={ha} points={points} generatedAt={Date.now()} />).toBlob();
      download(blob, `${t("ui.samplingFile")}-${plot.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.samplingTitle")}</h3>
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("ui.samplingOpen")}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label={t("ui.samplingDensity")} className="flex gap-2 text-sm">
            {SAMPLING_HA.map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={ha === v}
                onClick={() => setHa(v)}
                className={`cursor-pointer rounded border px-3 py-1.5 ${ha === v ? "border-surco bg-surco text-lino" : "border-linea"}`}
              >
                {t("ui.samplingPerPoint", { ha: v })}
              </button>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-lino" role="img" aria-label={t("ui.samplingTitle")}>
            <path d={plotPath(plot, px, py)} stroke={BRAND.surco} strokeWidth="1.5" fill={BRAND.soja} fillOpacity="0.12" />
            {points.map((p) => (
              <g key={p.n}>
                <circle cx={px(p.lon)} cy={py(p.lat)} r="5" fill={BRAND.trigo} stroke={BRAND.surco} strokeWidth="0.8" />
                <text x={px(p.lon) + 7} y={py(p.lat) + 3} fontSize="8" fontWeight="600" fill={BRAND.surco}>
                  {p.n}
                </text>
              </g>
            ))}
          </svg>
          <p className="text-xs text-tinta-2">
            {t("ui.samplingCount", { n: points.length })} · {t("ui.samplingHow")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={pdfFile} disabled={busy || !farm}>
              {busy ? t("ui.samplingPdfWorking") : t("ui.samplingPdf")}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                tableToCsv({
                  name: `${t("ui.samplingFile")}-${plot.name}`,
                  headers: [t("ui.samplingColN"), t("ui.samplingColLat"), t("ui.samplingColLon")],
                  rows: points.map((p) => [p.n, p.lat, p.lon]),
                })
              }
            >
              {t("ui.samplingCsv")}
            </Button>
          </div>
          {error ? <ErrorBox error={error} /> : null}
        </div>
      )}
    </div>
  );
}
