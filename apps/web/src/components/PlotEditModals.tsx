import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { LineString, Polygon } from "geojson";
import { areaHa, mergePolygons, splitPolygon } from "@yvy/geo";
import { post } from "../lib/api";
import { fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { Button, ErrorBox, Field, FormActions, Input, Modal, toast } from "./ui";

/** M-05: confirma la división de un lote con la línea dibujada. */
export function SplitModal({
  plot,
  line,
  onClose,
  onDone,
}: {
  plot: Plot;
  line: LineString;
  onClose: () => void;
  onDone: () => void;
}) {
  const result = useMemo(() => splitPolygon(JSON.parse(plot.geometry) as Polygon, line), [plot.geometry, line]);
  const [names, setNames] = useState<[string, string]>([`${plot.name} A`, `${plot.name} B`]);
  const save = useMutation({
    mutationFn: () => {
      if (!result.ok) throw new Error(tk(`ui.splitError_${result.error}`));
      return post(`/org/plots/${plot.id}/split`, {
        parts: result.parts.map((geometry, i) => ({ name: names[i]!.trim(), geometry })),
      });
    },
    onSuccess: () => {
      toast(t("ui.toastPlotSplit"));
      onDone();
    },
  });
  const valid = names.every((n) => n.trim());
  return (
    <Modal title={t("ui.splitPlot")} onClose={onClose}>
      {!result.ok ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-peligro">
            {tk(`ui.splitError_${result.error}`)}
          </p>
          <div>
            <Button onClick={onClose}>{t("ui.close")}</Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <p className="text-sm text-tinta-2">{plot.name}</p>
          {result.parts.map((p, i) => (
            <Field key={i} label={`${t("ui.splitName")} ${i + 1}`} hint={fmtHa(areaHa(p))}>
              <Input
                value={names[i]}
                maxLength={120}
                onChange={(e) => setNames((n) => (i === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
              />
            </Field>
          ))}
          <p className="text-xs text-tinta-2">{t("ui.splitMergeNote")}</p>
          {save.error ? <ErrorBox error={save.error} /> : null}
          <FormActions onCancel={onClose} disabled={!valid || save.isPending} label={t("ui.splitSave")} />
        </form>
      )}
    </Modal>
  );
}

/** M-05: confirma la unión de dos lotes contiguos. */
export function MergeModal({
  a,
  b,
  onClose,
  onDone,
}: {
  a: Plot;
  b: Plot;
  onClose: () => void;
  onDone: () => void;
}) {
  const result = useMemo(
    () => mergePolygons(JSON.parse(a.geometry) as Polygon, JSON.parse(b.geometry) as Polygon),
    [a.geometry, b.geometry],
  );
  const [name, setName] = useState(a.name);
  const save = useMutation({
    mutationFn: () => {
      if (!result.ok) throw new Error(tk(`ui.mergeError_${result.error}`));
      return post("/org/plots/merge", { ids: [a.id, b.id], name: name.trim(), geometry: result.polygon });
    },
    onSuccess: () => {
      toast(t("ui.toastPlotsMerged"));
      onDone();
    },
  });
  return (
    <Modal title={t("ui.mergePlots")} onClose={onClose}>
      {!result.ok ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-peligro">
            {tk(`ui.mergeError_${result.error}`)}
          </p>
          <div>
            <Button onClick={onClose}>{t("ui.close")}</Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <p className="text-sm text-tinta-2">
            {a.name} + {b.name}
          </p>
          <Field label={t("ui.mergeName")} hint={fmtHa(areaHa(result.polygon))}>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <p className="text-xs text-tinta-2">{t("ui.splitMergeNote")}</p>
          {save.error ? <ErrorBox error={save.error} /> : null}
          <FormActions onCancel={onClose} disabled={!name.trim() || save.isPending} label={t("ui.mergeSave")} />
        </form>
      )}
    </Modal>
  );
}
