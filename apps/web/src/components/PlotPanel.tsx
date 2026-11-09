import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CHART, CROPS, PLOT_KINDS, SEASONS } from "@yvy/shared";
import { del, get, patch } from "../lib/api";
import { fmtDate, fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { Member, Plot } from "../lib/types";
import { LineChart } from "./charts";
import { Button, Card, Empty, ErrorBox, Field, Input, Select } from "./ui";

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
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/org/plots/${plot.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm", plot.farmId] });
      onClose();
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{plot.name}</h2>
          <p className="text-sm text-surco/70">
            {fmtHa(plot.areaHa)} ·{" "}
            {plot.kind === "crop" ? `${t("ui.crop")}${plot.crop ? `: ${plot.crop}` : ""}` : t("ui.pasture")}
            {plot.season ? ` · ${plot.season}` : ""}
          </p>
          {workers.length > 0 && <p className="text-xs text-surco/60">{workers.map((w) => w.fullName).join(", ")}</p>}
        </div>
        <button aria-label={t("ui.close")} onClick={onClose} className="text-surco/50 hover:text-surco">
          ✕
        </button>
      </div>

      {canEdit && ndvi.data && (
        <div>
          {ndvi.data.current ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-semibold">{ndvi.data.current.mean.toFixed(2)}</span>
                <span className="text-sm text-surco/70">
                  {t("ui.ndviCurrent")} · {fmtDate(ndvi.data.current.acquiredAt)}
                </span>
              </div>
              {ndvi.data.deltaVsFarmPct !== null && (
                <p className={`text-sm ${ndvi.data.deltaVsFarmPct < -5 ? "text-alerta" : "text-surco/70"}`}>
                  {t("ui.ndviVsFarm", {
                    pct: `${ndvi.data.deltaVsFarmPct >= 0 ? "+" : ""}${Math.round(ndvi.data.deltaVsFarmPct)}`,
                  })}
                </p>
              )}
              <h3 className="mt-3 text-sm font-semibold">{t("ui.ndviCurve")}</h3>
              <LineChart
                ariaLabel={t("ui.ndviCurve")}
                yLabel="NDVI"
                yDomain={[0, 1]}
                formatX={(x) => fmtDate(x).slice(0, 5)}
                formatY={(y) => y.toFixed(2)}
                series={[
                  {
                    name: plot.name,
                    color: CHART.primary,
                    points: ndvi.data.series.map((p) => ({ x: p.acquiredAt, y: p.mean })),
                  },
                  {
                    name: "Promedio del campo",
                    color: CHART.comparison,
                    dashed: true,
                    points: ndvi.data.farmAvg.map((p) => ({ x: p.acquiredAt, y: p.mean })),
                  },
                ]}
              />
              <p className="text-xs text-surco/60">{t("attribution.copernicus")}</p>
            </>
          ) : (
            <Empty>{t("ui.noNdvi")}</Empty>
          )}
        </div>
      )}
      {ndvi.error && <ErrorBox error={ndvi.error} />}

      {canEdit && !editing && (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {t("ui.edit")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => confirm(t("ui.confirmDelete", { name: plot.name })) && remove.mutate()}
          >
            {t("ui.delete")}
          </Button>
        </div>
      )}
      {editing && (
        <form
          className="flex flex-col gap-2"
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
            <div className="grid grid-cols-2 gap-2">
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
            <Button type="submit" disabled={save.isPending}>
              {t("ui.save")}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t("ui.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export const kindLabel = (k: string) => tk(`recordKinds.${k}`);
