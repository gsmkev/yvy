import { useState } from "react";
import { analysisAreas, ATTRIBUTION, parseCoverKey, summarizeCover } from "@yvy/shared";
import { download } from "../../lib/exports";
import { fmtHa } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { AnalysisPlot, CoverMetrics, FarmDetail, Me } from "../../lib/types";
import { boundsOf, FarmMap } from "../FarmMap";
import { Button, DataTable, ErrorBox, Field, Select, Stat, type Column } from "../ui";
import { CLASSES, day } from "./util";

/** Resultado de un cambio de cobertura: clases, conversiones, mapa y PDF. */
export function CoverResult({
  farm,
  me,
  rows,
  sum,
  range,
  keys,
  keyValue,
  onPick,
}: {
  farm: FarmDetail;
  me: Me | undefined;
  rows: AnalysisPlot<CoverMetrics>[];
  sum: NonNullable<ReturnType<typeof summarizeCover>>;
  range: NonNullable<ReturnType<typeof parseCoverKey>>;
  keys: string[];
  keyValue: string | undefined;
  onPick: (k: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const f = farm.farm;
  const pdfFile = async () => {
    setBusy(true);
    setError(null);
    try {
      const [{ pdf }, { CoverReport }] = await Promise.all([import("@react-pdf/renderer"), import("../../lib/coverPdf")]);
      const blob = await pdf(<CoverReport farm={f} rows={rows} from={range.from} to={range.to} plots={farm.plots} generatedAt={Date.now()} />).toBlob();
      download(blob, `${t("ui.cover.pdfFile")}-${f.name}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const classRows = CLASSES.map((c) => ({ c, from: sum.from[c] ?? 0, to: sum.to[c] ?? 0 }));
  const cols: Column<(typeof classRows)[number]>[] = [
    { id: "class", header: t("ui.cover.colClass"), cell: (r) => t(`ui.cover.class_${r.c}`) },
    { id: "from", header: day(range.from), align: "right", cell: (r) => fmtHa(r.from) },
    { id: "to", header: day(range.to), align: "right", cell: (r) => fmtHa(r.to) },
    { id: "diff", header: t("ui.cover.colDiff"), align: "right", cell: (r) => `${r.to - r.from > 0 ? "+" : ""}${fmtHa(r.to - r.from)}` },
  ];
  return (
    <>
    {keys.length > 1 && (
      <div className="max-w-xs">
        <Field label={t("ui.cover.pick")}>
          <Select
            value={keyValue}
            onChange={(e) => onPick(e.target.value)}
            options={keys.map((k) => {
              const r = parseCoverKey(k);
              return { value: k, label: r ? t("ui.cover.range", { from: day(r.from), to: day(r.to) }) : k };
            })}
          />
        </Field>
      </div>
    )}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-tinta-2">{t("ui.cover.range", { from: day(range.from), to: day(range.to) })}</p>
      <Button variant="secondary" onClick={pdfFile} disabled={busy}>
        {busy ? t("ui.cover.pdfWorking") : t("ui.cover.pdf")}
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-linea py-5 sm:grid-cols-3">
      <Stat label={t("ui.cover.forestFrom", { date: day(range.from) })} value={fmtHa(sum.from.forest)} />
      <Stat label={t("ui.cover.forestTo", { date: day(range.to) })} value={fmtHa(sum.to.forest)} />
      {sum.forestLostHa > 0 && <Stat label={t("ui.cover.forestLost")} value={fmtHa(sum.forestLostHa)} tone="danger" />}
    </div>
    <div className="grid items-start gap-x-10 gap-y-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <DataTable columns={cols} rows={classRows} rowKey={(r) => r.c} caption={t("ui.cover.title")} />
        <p className="text-sm text-tinta-2">
          {t("ui.cover.conversions", { pasture: fmtHa(sum.forestToPasture), crop: fmtHa(sum.forestToCrop), other: fmtHa(sum.forestToOther) })}
        </p>
      </div>
      <div className="h-80 overflow-hidden rounded-lg border border-linea">
        <FarmMap
          outline={f.geometry}
          plots={farm.plots}
          problemAreas={analysisAreas(rows)}
          layers={farm.layers}
          tilesBaseUrl={me?.tilesBaseUrl}
          bounds={boundsOf(f)}
          className="h-full w-full"
        />
      </div>
    </div>
    {error ? <ErrorBox error={error} /> : null}
    <p className="text-sm text-tinta-2">{t("ui.cover.disclaimer")}</p>
    <p className="text-sm text-tinta-2">{t("ui.cover.method")}</p>
    <p className="text-micro text-tinta-2">{t(ATTRIBUTION.copernicus)}</p>
    </>
  );
}
