import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { centroidOf, type Area } from "@yvy/geo";
import { CHART, CROPS, PLOT_KINDS, SEASONS } from "@yvy/shared";
import { del, get, patch, post } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import type { FarmDetail } from "../lib/types";
import { fmtDate, fmtDay, fmtHa, fmtIsoDate, fmtNdvi, fmtNum, fmtPct, toIso } from "../lib/format";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { ActionMenu } from "./menus";
import { t, tk } from "../lib/i18n";
import { fmtDensity } from "./SeasonsPanel";
import type { Farm, Member, Plot, PlotHistoryRow, ProblemArea } from "../lib/types";
import { CopyCoords } from "./CopyCoords";
import { PlotAgro } from "./PlotAgro";
import { PlotResults } from "./PlotResults";
import { LineChart } from "./charts";
import { SamplingGrid } from "./SamplingGrid";
import { VigorSeasons } from "./VigorSeasons";
import { Button, ConfirmModal, ErrorBox, Field, FormActions, Input, Select, Spinner, Stat, toast } from "./ui";

interface Ndvi {
  series: { acquiredAt: number; mean: number; p10: number; p90: number; validPct: number; lowConfidence: boolean }[];
  farmAvg: { acquiredAt: number; mean: number }[];
  current: { acquiredAt: number; mean: number; lowConfidence: boolean } | null;
  others?: Record<string, { acquiredAt: number; mean: number; lowConfidence: boolean }>;
  deltaVsFarmPct: number | null;
}

export function PlotPanel({
  plot,
  workers,
  canEdit,
  onClose,
  problemAreas = [],
  onShowArea,
  onEditShape,
  onSplit,
  onMerge,
  farm,
}: {
  plot: Plot;
  workers: Member[];
  canEdit: boolean;
  onClose: () => void;
  /** Áreas problema de este lote (S-08). */
  problemAreas?: ProblemArea[];
  onShowArea?: (a: ProblemArea) => void;
  /** M-02: pasa el mapa a edición de vértices de este lote. */
  onEditShape?: () => void;
  /** M-05: dibujar una línea para dividir el lote / elegir otro lote para unir. */
  onSplit?: () => void;
  onMerge?: () => void;
  /** Estancia del lote (encabezado de la grilla de muestreo). */
  farm?: Farm;
}) {
  const qc = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  // Al abrir la ficha el foco pasa al título, para que el lector de pantalla anuncie el lote
  useEffect(() => heading.current?.focus(), []);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({
    name: plot.name,
    kind: plot.kind,
    crop: plot.crop ?? "",
    season: plot.season ?? "",
    sowingDate: plot.sowingDate ?? "",
    pastureType: plot.pastureType ?? "",
  });
  const ndvi = useQuery({
    queryKey: ["ndvi", plot.id],
    queryFn: () => get<Ndvi>(`/org/plots/${plot.id}/ndvi`),
    enabled: canEdit,
  });
  const history = useQuery({
    queryKey: ["plot-history", plot.id],
    queryFn: () => get<PlotHistoryRow[]>(`/org/plots/${plot.id}/seasons`),
    enabled: plot.kind === "crop",
  });
  const save = useMutation({
    mutationFn: () =>
      patch(`/org/plots/${plot.id}`, {
        name: form.name,
        kind: form.kind,
        crop: form.kind === "crop" ? form.crop || null : null,
        season: form.kind === "crop" ? form.season || null : null,
        sowingDate: form.sowingDate || null,
        pastureType: form.kind === "pasture" ? form.pastureType || null : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm", plot.farmId] });
      toast(t("ui.toastPlotUpdated"));
      setEditing(false);
    },
  });
  const [assigneeId, setAssigneeId] = useState(workers[0]?.userId ?? "");
  const sendArea = useMutation({
    mutationFn: (a: ProblemArea) =>
      post("/org/tasks", {
        farmId: plot.farmId,
        plotId: plot.id,
        assigneeId: assigneeId || workers[0]?.userId,
        title: t("ui.problemTaskTitle", { ha: fmtNum(Math.round(a.areaHa * 10) / 10), plot: plot.name }),
        kind: "scouting",
        dueDate: toIso(Date.now()),
        recurrence: "none",
        lon: a.lon,
        lat: a.lat,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      const w = workers.find((x) => x.userId === (assigneeId || workers[0]?.userId));
      toast(t("ui.problemTaskSent", { name: w?.fullName ?? "" }));
    },
  });
  const remove = () => {
    deleteWithUndo({
      qc,
      id: plot.id,
      message: t("ui.toastPlotDeleted"),
      hide: () =>
        qc.setQueryData<FarmDetail>(
          ["farm", plot.farmId],
          (d) => d && { ...d, plots: d.plots.filter((p) => p.id !== plot.id) },
        ),
      request: () => del(`/org/plots/${plot.id}`),
      invalidate: [["farm", plot.farmId], ["farms"]],
    });
    onClose();
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const delta = ndvi.data?.deltaVsFarmPct ?? null;
  const isPolygon = JSON.parse(plot.geometry).type === "Polygon";
  return (
    <div className="flex flex-col gap-5">
      <div>
        <button
          onClick={onClose}
          className="cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline print:hidden"
        >
          ← {t("ui.allPlots")}
        </button>
        {editing ? (
          <div className="mt-3">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Field label={t("ui.plot")}>
                <Input value={form.name} onChange={set("name")} required />
              </Field>
              <Field label={t("ui.plotKind")}>
                <Select
                  value={form.kind}
                  onChange={set("kind")}
                  options={PLOT_KINDS.map((k) => ({ value: k, label: k === "crop" ? t("ui.crop") : t("ui.pasture") }))}
                />
              </Field>
              {form.kind === "crop" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("ui.crop")}>
                    <Select
                      value={form.crop}
                      onChange={set("crop")}
                      options={[{ value: "", label: "—" }, ...CROPS.map((c) => ({ value: c, label: c }))]}
                    />
                  </Field>
                  <Field label={t("ui.season")}>
                    <Select
                      value={form.season}
                      onChange={set("season")}
                      options={[{ value: "", label: "—" }, ...SEASONS.map((c) => ({ value: c, label: c }))]}
                    />
                  </Field>
                  <Field label={t("ui.sowingDate")}>
                    <Input type="date" value={form.sowingDate} onChange={set("sowingDate")} />
                  </Field>
                </div>
              ) : (
                <Field label={t("ui.pastureType")}>
                  <Input value={form.pastureType} onChange={set("pastureType")} />
                </Field>
              )}
              {save.error && <ErrorBox error={save.error} />}
              <FormActions onCancel={() => setEditing(false)} disabled={save.isPending} />
            </form>
          </div>
        ) : (
          <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <h2 ref={heading} tabIndex={-1} className="min-w-0 font-serif text-[24px] leading-8 font-semibold outline-none">
              {plot.name}
            </h2>
            {canEdit && !editing && (
              <div className="flex shrink-0 items-center gap-1 print:hidden">
                <Button onClick={() => setEditing(true)}>{t("ui.edit")}</Button>
                <ActionMenu
                  label={t("ui.rowActions", { name: plot.name })}
                  items={[
                    onEditShape && { label: t("ui.plotEditShape"), onSelect: onEditShape },
                    onSplit && isPolygon && { label: t("ui.splitPlot"), onSelect: onSplit },
                    onMerge && isPolygon && { label: t("ui.mergePlots"), onSelect: onMerge },
                    { label: t("ui.delete"), onSelect: () => setConfirming(true), danger: true },
                  ]}
                />
              </div>
            )}
          </div>
          <p className="num mt-1 text-sm text-tinta-2">
            {plot.kind === "pasture" ? t("ui.pasture") : (plot.crop ?? t("ui.crop"))} · {fmtHa(plot.areaHa)}
            {plot.season ? ` · ${plot.season}` : ""}
          </p>
          <p className="mt-1 text-sm text-tinta-2">
            {workers.length
              ? `${t("ui.assignedTo")} ${workers.map((w) => w.fullName).join(", ")}`
              : t("ui.nobodyAssigned")}
          </p>
          <CopyCoords className="mt-2" {...centroidOf(JSON.parse(plot.geometry) as Area)} />
          </>
        )}
      </div>

      {canEdit && ndvi.isLoading && <Spinner />}
      {canEdit && ndvi.data && (
        <div className="border-t border-linea pt-4">
          {ndvi.data.current ? (
            <>
              <div className="flex items-end gap-6">
                <Stat
                  label={t("ui.ndviCurrent")}
                  value={fmtNdvi(ndvi.data.current.mean)}
                  note={fmtDate(ndvi.data.current.acquiredAt)}
                />
                {delta !== null && (
                  <div className="flex flex-col gap-0.5 pb-0.5">
                    <span className="eyebrow">{t("ui.farmAverage")}</span>
                    <span
                      className={`num flex items-center gap-1 text-base font-medium ${delta < -5 ? "text-peligro" : ""}`}
                    >
                      {delta < -0.5 ? (
                        <TrendingDown size={16} aria-hidden />
                      ) : delta > 0.5 ? (
                        <TrendingUp size={16} aria-hidden />
                      ) : (
                        <Minus size={16} aria-hidden />
                      )}
                      {Math.abs(delta) < 0.5 ? t("ui.sameAsFarm") : fmtPct(delta)}
                    </span>
                  </div>
                )}
              </div>
              {ndvi.data.current.lowConfidence && (
                <p className="mt-2 rounded border border-trigo/60 px-2 py-1 text-xs text-tinta-2" role="note">
                  <strong>{t("ui.lowConfidence")}.</strong> {t("ui.lowConfidenceNote")}
                </p>
              )}
              {ndvi.data.others && Object.keys(ndvi.data.others).length > 0 && (
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {(["ndre", "ndmi", "evi"] as const).map((k) => {
                    const o = ndvi.data!.others![k];
                    return o ? (
                      <div key={k}>
                        <dt className="eyebrow">{t(`ui.index_${k}`)}</dt>
                        <dd className="num text-base font-medium">{fmtNdvi(o.mean)}</dd>
                      </div>
                    ) : null;
                  })}
                </dl>
              )}
              <h3 className="eyebrow mt-5 mb-1">{t("ui.ndviCurve")}</h3>
              <LineChart
                ariaLabel={t("ui.ndviCurve")}
                yLabel="NDVI"
                yDomain={[0, 1]}
                formatX={(x) => fmtDay(x)}
                formatY={(y) => fmtNdvi(y)}
                series={[
                  {
                    name: plot.name,
                    color: CHART.primary,
                    points: ndvi.data.series.map((p) => ({ x: p.acquiredAt, y: p.mean })),
                  },
                  {
                    name: t("ui.farmAverage"),
                    color: CHART.comparison,
                    dashed: true,
                    points: ndvi.data.farmAvg.map((p) => ({ x: p.acquiredAt, y: p.mean })),
                  },
                ]}
              />
              <p className="mt-1 text-[11px] text-tinta-2">{t("attribution.copernicus")}</p>
            </>
          ) : (
            <p className="text-sm text-tinta-2">{t("ui.noNdvi")}</p>
          )}
        </div>
      )}
      {canEdit && <SamplingGrid plot={plot} farm={farm} />}
      {canEdit && <VigorSeasons plotId={plot.id} farmId={plot.farmId} />}
      {ndvi.error && <ErrorBox error={ndvi.error} />}

      {canEdit && problemAreas.length > 0 && (
        <div className="border-t border-linea pt-4">
          <h3 className="eyebrow mb-1">{t("ui.problemAreasTitle")}</h3>
          <p className="mb-2 text-xs text-tinta-2">
            {t("ui.problemAreasHint", { date: fmtDate(problemAreas[0]!.acquiredAt) })}
          </p>
          {workers.length > 1 && (
            <Field label={t("ui.problemTaskTo")}>
              <Select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                options={workers.map((w) => ({ value: w.userId, label: w.fullName }))}
              />
            </Field>
          )}
          {workers.length === 0 && <p className="mb-2 text-xs text-tinta-2">{t("ui.problemTaskNoWorker")}</p>}
          <ul className="flex flex-col gap-3 text-sm">
            {problemAreas.map((a) => (
              <li key={a.id} className="flex flex-col gap-1">
                <span className="num">
                  {fmtHa(a.areaHa)} · {t("ui.problemAreaNdvi", { v: fmtNdvi(a.meanNdvi), m: fmtNdvi(a.plotMedianNdvi) })}
                </span>
                <span className="flex gap-4">
                  <button
                    className="cursor-pointer text-accion underline underline-offset-2"
                    onClick={() => onShowArea?.(a)}
                  >
                    {t("ui.problemAreaShow")}
                  </button>
                  <button
                    className="cursor-pointer text-accion underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={workers.length === 0 || sendArea.isPending}
                    onClick={() => sendArea.mutate(a)}
                  >
                    {sendArea.isPending ? t("ui.problemTaskSending") : t("ui.problemTaskSend")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {sendArea.error && <ErrorBox error={sendArea.error} />}
        </div>
      )}

      {plot.kind === "crop" && (
        <div className="border-t border-linea pt-4">
          <h3 className="eyebrow mb-1">{t("ui.rotationTitle")}</h3>
          {history.isLoading && <Spinner />}
          {history.error && <ErrorBox error={history.error} />}
          {history.data && history.data.length === 0 && <p className="text-sm text-tinta-2">{t("ui.rotationNone")}</p>}
          {history.data && history.data.length > 0 && (
            <ul className="divide-y divide-linea border-y border-linea text-sm">
              {history.data.map((h) => (
                <li key={h.seasonId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{h.seasonName}</span>
                    <span>{h.crop ? tk(`fields.crop_${h.crop}`) : "—"}</span>
                  </div>
                  {h.yieldTHa !== null && (
                    <p className="num mt-0.5">
                      {t("ui.yieldPerHa")}: <strong>{fmtNum(h.yieldTHa)} t/ha</strong>
                      <span className="text-xs text-tinta-2">
                        {" "}
                        · {t("ui.rotationHarvest", { tons: fmtNum(h.harvestTons ?? 0) })}
                        {h.targetYieldTHa !== null ? ` · ${t("ui.yieldVsTarget", { n: fmtNum(h.targetYieldTHa) })}` : ""}
                      </span>
                    </p>
                  )}
                  <p className="num mt-0.5 text-xs text-tinta-2">
                    {[
                      h.variety,
                      h.sownOn
                        ? t("ui.rotationSown", { date: fmtDate(h.sownOn) })
                        : h.plannedSowingDate
                          ? t("ui.rotationPlanned", { date: fmtIsoDate(h.plannedSowingDate) })
                          : null,
                      h.sowingDensity !== null && h.densityUnit ? fmtDensity(h.sowingDensity, h.densityUnit) : null,
                      h.targetYieldTHa !== null && h.yieldTHa === null ? `${t("ui.seasonTargetYield")}: ${fmtNum(h.targetYieldTHa)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canEdit && <PlotResults plot={plot} />}

      {canEdit && <PlotAgro plot={plot} />}

      {confirming && (
        <ConfirmModal
          title={plot.name}
          message={t("ui.confirmDelete", { name: plot.name })}
          confirmLabel={t("ui.delete")}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export const kindLabel = (k: string) => tk(`recordKinds.${k}`);
