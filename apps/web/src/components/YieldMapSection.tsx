import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import type { Area } from "@yvy/geo";
import { NDVI_RAMP } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtNum } from "../lib/format";
import { t, tk } from "../lib/i18n";
import { useSeasons } from "../lib/queries";
import type { Plot } from "../lib/types";
import {
  extractPoints,
  numericFields,
  readYieldFile,
  summarizeYield,
  YIELD_UNITS,
  type YieldSummary,
  type YieldUnit,
} from "../lib/yieldMap";
import { Button, ErrorBox, Field, Input, Select, toast } from "./ui";

interface SavedMap {
  id: string;
  seasonId: string | null;
  seasonName: string | null;
  fileName: string;
  nPoints: number;
  nDropped: number;
  meanTHa: number;
  p10THa: number;
  p90THa: number;
  maxTHa: number;
  minTHa: number;
  cvPct: number;
  cellM: number;
  cells: string;
}

/** Grilla de promedios dibujada en SVG, coloreada de menos a más rendimiento con la rampa de vigor. */
export function YieldCells({ cells, p10, p90, label }: { cells: [number, number, number, number][]; p10: number; p90: number; label: string }) {
  const W = 300;
  const geo = useMemo(() => {
    const lons = cells.map((c) => c[0]);
    const lats = cells.map((c) => c[1]);
    const [x0, x1] = [Math.min(...lons), Math.max(...lons)];
    const [y0, y1] = [Math.min(...lats), Math.max(...lats)];
    const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const spanX = Math.max((x1 - x0) * k, 1e-6);
    const spanY = Math.max(y1 - y0, 1e-6);
    const scale = W / Math.max(spanX, spanY);
    return { x0, y1, k, scale, w: Math.max(spanX * scale, 1), h: Math.max(spanY * scale, 1) };
  }, [cells]);
  const side = Math.max(3, Math.min(14, Math.sqrt((geo.w * geo.h) / Math.max(cells.length, 1)) * 0.95));
  const color = (v: number) => {
    const f = p90 > p10 ? Math.min(1, Math.max(0, (v - p10) / (p90 - p10))) : 0.5;
    return NDVI_RAMP[Math.min(NDVI_RAMP.length - 1, Math.floor(f * NDVI_RAMP.length))]!;
  };
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${geo.w + side} ${geo.h + side}`} className="w-full max-w-[320px] rounded-md border border-linea bg-lino">
      {cells.map((c, i) => (
        <rect
          key={i}
          x={(c[0] - geo.x0) * geo.k * geo.scale}
          y={(geo.y1 - c[1]) * geo.scale}
          width={side}
          height={side}
          fill={color(c[2])}
        />
      ))}
    </svg>
  );
}

const Stats = ({ s }: { s: Pick<YieldSummary, "meanTHa" | "p10THa" | "p90THa" | "cvPct" | "nPoints" | "nDropped"> }) => (
  <p className="num text-sm">
    {t("ui.yieldMapStats", { mean: fmtNum(s.meanTHa), p10: fmtNum(s.p10THa), p90: fmtNum(s.p90THa), cv: fmtNum(s.cvPct) })}
    <span className="block text-xs text-tinta-2">{t("ui.yieldMapPoints", { n: fmtNum(s.nPoints), dropped: fmtNum(s.nDropped) })}</span>
  </p>
);

/** Mapa de rendimiento de la cosechadora por lote y campaña (A-21): se sube el shapefile y se ve la variabilidad. */
export function YieldMapSection({ plot }: { plot: Plot }) {
  const qc = useQueryClient();
  const maps = useQuery({ queryKey: ["yield-maps", plot.id], queryFn: () => get<SavedMap[]>(`/org/plots/${plot.id}/yield-maps`) });
  const seasons = useSeasons(plot.farmId);
  const [fc, setFc] = useState<FeatureCollection | null>(null);
  const [fileName, setFileName] = useState("");
  const [field, setField] = useState("");
  const [unit, setUnit] = useState<YieldUnit>("t_ha");
  const [seasonId, setSeasonId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const fields = useMemo(() => (fc ? numericFields(fc) : []), [fc]);
  const summary = useMemo(() => {
    if (!fc || !field) return null;
    return summarizeYield(extractPoints(fc, field), unit, plot.crop, JSON.parse(plot.geometry) as Area);
  }, [fc, field, unit, plot]);
  const reset = () => {
    setFc(null);
    setFileName("");
    setField("");
  };
  const pick = async (file: File | undefined) => {
    setErr(null);
    reset();
    if (!file) return;
    try {
      const parsed = await readYieldFile(file);
      const f = numericFields(parsed);
      if (!f.length) throw new Error(t("ui.yieldMapNoField"));
      setFc(parsed);
      setFileName(file.name);
      setField(f[0]!);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const save = useMutation({
    mutationFn: () => {
      const { cells, ...rest } = summary!;
      return post(`/org/plots/${plot.id}/yield-maps`, { ...rest, cells, fileName, seasonId: seasonId || null });
    },
    onSuccess: () => {
      toast(t("ui.yieldMapSaved"));
      reset();
      qc.invalidateQueries({ queryKey: ["yield-maps", plot.id] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/yield-maps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["yield-maps", plot.id] }),
  });
  return (
    <div className="border-t border-linea pt-4">
      <h3 className="eyebrow mb-1">{t("ui.yieldMapTitle")}</h3>
      {(maps.data ?? []).map((m) => (
        <div key={m.id} className="mb-3 flex flex-col gap-1.5">
          <p className="text-sm font-medium">{m.seasonName ?? t("ui.yieldMapNoSeason")}</p>
          <Stats s={m} />
          <YieldCells cells={JSON.parse(m.cells)} p10={m.p10THa} p90={m.p90THa} label={t("ui.yieldMapTitle")} />
          <p className="text-xs text-tinta-2">
            {t("ui.yieldMapLegend", { lo: fmtNum(m.p10THa), hi: fmtNum(m.p90THa), cell: m.cellM })}{" "}
            <button className="cursor-pointer underline underline-offset-2 hover:text-peligro" onClick={() => remove.mutate(m.id)}>
              {t("ui.delete")}
            </button>
          </p>
        </div>
      ))}
      {maps.error && <ErrorBox error={maps.error} />}
      <Field label={t("ui.yieldMapFile")} hint={t("ui.yieldMapFileHint")}>
        <Input
          type="file"
          accept=".zip,.geojson,.json"
          className="!px-0 !py-0 file:mr-3 file:h-full file:cursor-pointer file:border-0 file:border-r file:border-linea file:bg-lino file:px-3 file:text-sm file:font-medium file:text-surco"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </Field>
      {err && <p className="mt-2 text-sm text-peligro">{err}</p>}
      {fc && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ui.yieldMapField")}>
              <Select value={field} onChange={(e) => setField(e.target.value)} options={fields.map((f) => ({ value: f, label: f }))} />
            </Field>
            <Field label={t("ui.yieldMapUnit")}>
              <Select
                value={unit}
                onChange={(e) => setUnit(e.target.value as YieldUnit)}
                options={YIELD_UNITS.map((u) => ({ value: u, label: tk(`ui.yieldUnit_${u}`) }))}
              />
            </Field>
          </div>
          <Field label={t("ui.season")}>
            <Select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              options={[{ value: "", label: "—" }, ...(seasons.data?.seasons ?? []).map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
          {summary ? (
            <>
              <Stats s={summary} />
              <YieldCells cells={summary.cells} p10={summary.p10THa} p90={summary.p90THa} label={t("ui.yieldMapTitle")} />
              <div className="flex gap-2">
                <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                  {t("ui.save")}
                </Button>
                <Button variant="quiet" onClick={reset}>
                  {t("ui.cancel")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-tinta-2">{t("ui.yieldMapNoPoints")}</p>
          )}
          {save.error && <ErrorBox error={save.error} />}
        </div>
      )}
    </div>
  );
}
