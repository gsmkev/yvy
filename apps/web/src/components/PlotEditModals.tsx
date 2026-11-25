/** Diálogos de confirmación para dividir un lote con una línea y para unir dos lotes contiguos. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { LineString, Polygon } from "geojson";
import { areaHa, mergePolygons, splitPolygon } from "@yvy/geo";
import { post } from "../lib/api";
import { fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";
import type { Plot } from "../lib/types";
import { Button, Field, Form, Input, Modal, toast, FormFooter } from "./ui";

/** Confirma la división de un lote con la línea dibujada. */
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
      if (!result.ok) throw new Error(tk(`ui.split.error_${result.error}`));
      return post(`/org/plots/${plot.id}/split`, {
        parts: result.parts.map((geometry, i) => ({ name: names[i]!.trim(), geometry })),
      });
    },
    onSuccess: () => {
      toast(t("ui.toast.plotSplit"));
      onDone();
    },
  });
  const valid = names.every((n) => n.trim());
  return (
    <Modal title={t("ui.split.plot")} onClose={onClose}>
      {!result.ok ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-peligro">
            {tk(`ui.split.error_${result.error}`)}
          </p>
          <div>
            <Button onClick={onClose}>{t("ui.common.close")}</Button>
          </div>
        </div>
      ) : (
        <Form className="flex flex-col gap-4" onSubmit={() => { if (valid) save.mutate(); }}>
          <p className="text-sm text-tinta-2">{plot.name}</p>
          {result.parts.map((p, i) => (
            <Field key={i} label={`${t("ui.split.name")} ${i + 1}`} hint={fmtHa(areaHa(p))}>
              <Input
                value={names[i]}
                maxLength={120}
                onChange={(e) => setNames((n) => (i === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
              />
            </Field>
          ))}
          <p className="text-xs text-tinta-2">{t("ui.split.mergeNote")}</p>
          <FormFooter error={save.error} disabled={!valid || save.isPending} label={t("ui.split.save")} />

        </Form>
      )}
    </Modal>
  );
}

/** Confirma la unión de dos lotes contiguos. */
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
      if (!result.ok) throw new Error(tk(`ui.merge.error_${result.error}`));
      return post("/org/plots/merge", { ids: [a.id, b.id], name: name.trim(), geometry: result.polygon });
    },
    onSuccess: () => {
      toast(t("ui.toast.plotsMerged"));
      onDone();
    },
  });
  return (
    <Modal title={t("ui.merge.plots")} onClose={onClose}>
      {!result.ok ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-peligro">
            {tk(`ui.merge.error_${result.error}`)}
          </p>
          <div>
            <Button onClick={onClose}>{t("ui.common.close")}</Button>
          </div>
        </div>
      ) : (
        <Form className="flex flex-col gap-4" onSubmit={() => { if (name.trim()) save.mutate(); }}>
          <p className="text-sm text-tinta-2">
            {a.name} + {b.name}
          </p>
          <Field label={t("ui.merge.name")} hint={fmtHa(areaHa(result.polygon))}>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <p className="text-xs text-tinta-2">{t("ui.split.mergeNote")}</p>
          <FormFooter error={save.error} disabled={!name.trim() || save.isPending} label={t("ui.merge.save")} />

        </Form>
      )}
    </Modal>
  );
}
