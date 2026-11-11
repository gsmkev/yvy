import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { centroidOf, type Area } from "@yvy/geo";
import { CHART, CROPS, PLOT_KINDS, SEASONS } from "@yvy/shared";
import { del, get, patch } from "../lib/api";
import { deleteWithUndo } from "../lib/undo";
import type { FarmDetail } from "../lib/types";
import { fmtDate, fmtDay, fmtHa, fmtNdvi, fmtPct } from "../lib/format";
import { Minus, Pencil, Satellite, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { t, tk } from "../lib/i18n";
import type { Member, Plot } from "../lib/types";
import { CopyCoords } from "./CopyCoords";
import { LineChart } from "./charts";
import { Button, ConfirmModal, Empty, ErrorBox, Field, Input, Select, Spinner, Stat, toast } from "./ui";

interface Ndvi {
  series: { acquiredAt: number; mean: number; p10: number; p90: number; validPct: number }[];
  farmAvg: { acquiredAt: number; mean: number }[];
  current: { acquiredAt: number; mean: number } | null;
  deltaVsFarmPct: number | null;
}

export function PlotPanel({
  plot,
  workers,
  canEdit,
  onClose,
}: {
  plot: Plot;
  workers: Member[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
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
  return (
    <div className="flex flex-col gap-5">
      <div>
        <button
          onClick={onClose}
          className="cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
        >
          ← {t("ui.allPlots")}
        </button>
        <h2 className="mt-3 font-serif text-[24px] leading-tight font-semibold">{plot.name}</h2>
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
            <Empty icon={Satellite}>{t("ui.noNdvi")}</Empty>
          )}
        </div>
      )}
      {ndvi.error && <ErrorBox error={ndvi.error} />}

      {canEdit && !editing && (
        <div className="flex gap-2 border-t border-linea pt-4">
          <Button icon={Pencil} onClick={() => setEditing(true)}>
            {t("ui.edit")}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
            {t("ui.delete")}
          </Button>
        </div>
      )}
      {editing && (
        <form
          className="flex flex-col gap-3 border-t border-linea pt-4"
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
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {t("ui.save")}
            </Button>
            <Button variant="quiet" onClick={() => setEditing(false)}>
              {t("ui.cancel")}
            </Button>
          </div>
        </form>
      )}
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
